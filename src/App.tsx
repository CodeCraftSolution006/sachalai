import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment, Chat, Message, Settings, Source } from "./types";
import { api, errorText } from "./lib/api";
import { buildApiMessages, extractSources, modelLabel, pickMode, titleFrom, uid } from "./lib/chat";
import Sidebar from "./components/Sidebar";
import Composer, { type ComposerHandle } from "./components/Composer";
import MessageView from "./components/MessageView";
import SettingsModal from "./components/SettingsModal";
import { IconBolt, IconDownload, IconRefresh } from "./components/Icons";
import WindowControls from "./components/WindowControls";
import { updater, type UpdateStatus } from "./lib/updater";
import robot from "./assets/robot.jpg";

const SUGGESTIONS: { label: string; prompt: string; web?: boolean; image?: boolean }[] = [
  { label: "🌐 Today's top tech news", prompt: "What are the most important tech news stories today?", web: true },
  { label: "✍️ Write a marketing plan", prompt: "Make a concise marketing plan for a new mobile app." },
  { label: "💻 Write code", prompt: "Write a TypeScript function that debounces another function, with an explanation." },
  { label: "🖼️ Analyze an image", prompt: "", image: true },
];

const IN_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function BrowserNotice() {
  return (
    <div className="app" style={{ alignItems: "center", justifyContent: "center" }}>
      <section className="welcome" style={{ textAlign: "center" }}>
        <div className="mascot">
          <img src={robot} alt="SachalAI robot" />
        </div>
        <h1 style={{ marginBottom: 12 }}>SachalAI is a desktop app</h1>
        <p className="disclaimer" style={{ maxWidth: 460, lineHeight: 1.7 }}>
          This browser tab is only the Vite dev preview — it can't reach the Groq backend. Use the separate
          <b> SachalAI window</b> that opens when you run <code>npm run tauri dev</code>.
        </p>
      </section>
    </div>
  );
}

export default function App() {
  return IN_TAURI ? <ChatApp /> : <BrowserNotice />;
}

function ChatApp() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState<{ notice?: string } | null>(null);
  const [webSearch, setWebSearch] = useState(() => localStorage.getItem("webSearch") === "1");
  const [busy, setBusy] = useState<{ chatId: string; requestId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(updater.getStatus());

  const composerRef = useRef<ComposerHandle>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const stoppedRef = useRef(new Set<string>());

  const active = chats.find((c) => c.id === activeId) ?? null;

  /* ---------- bootstrap ---------- */
  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      if (!s.hasApiKey) setSettingsOpen({ notice: "Welcome! Paste your Groq API key to get started." });
    });
    api
      .loadChats()
      .then((c) => setChats(Array.isArray(c) ? c : []))
      .catch(() => setChats([]))
      .finally(() => setLoaded(true));

    // Check for updates in the background after launch
    const unsub = updater.subscribe(setUpdateStatus);
    const timer = setTimeout(() => {
      updater.checkForUpdates(false).catch(() => {});
    }, 3500);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  /* ---------- persistence (debounced) ---------- */
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => api.saveChats(chats).catch((e) => console.error("save failed", e)), 600);
    return () => clearTimeout(t);
  }, [chats, loaded]);

  useEffect(() => localStorage.setItem("webSearch", webSearch ? "1" : "0"), [webSearch]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------- auto-scroll ---------- */
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [active?.messages]);

  /* ---------- state helpers ---------- */
  const updateChat = useCallback((id: string, fn: (c: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const patchMsg = useCallback(
    (chatId: string, msgId: string, patch: Partial<Message>) =>
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
      })),
    [updateChat],
  );

  /* ---------- generation ---------- */
  const runGeneration = useCallback(
    async (chatId: string, history: Message[]) => {
      if (!settings) return;
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      const mode = pickMode(lastUser);
      const web = mode === "text" && webSearch;

      const assistant: Message = {
        id: uid(),
        role: "assistant",
        content: "",
        reasoning: "",
        status: "streaming",
        createdAt: Date.now(),
        webSearch: web,
        model: mode === "vision" ? settings.visionModel : settings.textModel,
      };
      updateChat(chatId, (c) => ({ ...c, messages: [...history, assistant], updatedAt: Date.now() }));

      const requestId = uid();
      setBusy({ chatId, requestId });
      stickRef.current = true;

      const acc = {
        content: "",
        reasoning: "",
        sources: [] as Source[],
        model: assistant.model,
        waitUntil: undefined as number | undefined,
        waitReason: undefined as string | undefined,
      };
      let frame = 0;
      let resolveDone!: () => void;
      const done = new Promise<void>((r) => (resolveDone = r));
      const flush = () => {
        frame = 0;
        patchMsg(chatId, assistant.id, { ...acc });
      };
      const started = performance.now();

      try {
        await api.streamChat(
          { requestId, mode, messages: buildApiMessages(history, mode), webSearch: web },
          (e) => {
            if (e.type === "content" || e.type === "reasoning") acc.waitUntil = undefined;
            switch (e.type) {
              case "waiting":
                acc.waitUntil = Date.now() + e.seconds * 1000;
                acc.waitReason = e.reason;
                break;
              case "start":
                acc.model = e.model;
                break;
              case "content":
                acc.content += e.delta;
                break;
              case "reasoning":
                acc.reasoning += e.delta;
                break;
              case "tools":
                acc.sources = extractSources(e.tools, acc.sources);
                break;
              case "done":
                resolveDone();
                return;
            }
            if (!frame) frame = requestAnimationFrame(flush);
          },
        );
        // channel messages can trail the command response slightly
        await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
        cancelAnimationFrame(frame);
        const wasStopped = stoppedRef.current.delete(requestId);
        patchMsg(chatId, assistant.id, {
          ...acc,
          waitUntil: undefined,
          status: wasStopped ? "stopped" : "done",
          durationMs: Math.round(performance.now() - started),
          error: !wasStopped && !acc.content.trim() ? "The model returned an empty response. Try again." : undefined,
        });
      } catch (err) {
        cancelAnimationFrame(frame);
        patchMsg(chatId, assistant.id, { ...acc, waitUntil: undefined, status: "error", error: errorText(err) });
      } finally {
        setBusy(null);
      }
    },
    [settings, webSearch, updateChat, patchMsg],
  );

  const send = (text: string, images: Attachment[]) => {
    if (!settings?.hasApiKey) {
      setSettingsOpen({ notice: "Add your Groq API key first." });
      return;
    }
    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: text,
      images: images.length ? images : undefined,
      createdAt: Date.now(),
    };
    let chatId = activeId;
    let history: Message[];
    if (!active) {
      chatId = uid();
      const chat: Chat = {
        id: chatId,
        title: titleFrom(text, images),
        messages: [userMsg],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setChats((prev) => [chat, ...prev]);
      setActiveId(chatId);
      history = [userMsg];
    } else {
      history = [...active.messages, userMsg];
    }
    runGeneration(chatId!, history);
  };

  const stop = () => {
    if (!busy) return;
    stoppedRef.current.add(busy.requestId);
    api.cancelStream(busy.requestId);
  };

  const regenerate = () => {
    if (!active || busy) return;
    const msgs = [...active.messages];
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    if (msgs.length) runGeneration(active.id, msgs);
  };

  const newChat = () => {
    setActiveId(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const deleteChat = (id: string) => {
    if (busy?.chatId === id) stop();
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  /* ---------- shortcuts ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        newChat();
      } else if (k === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      } else if (k === ",") {
        e.preventDefault();
        setSettingsOpen({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isBusyHere = !!busy && (busy.chatId === activeId || !activeId);
  const lastIdx = (active?.messages.length ?? 0) - 1;

  const composer = (
    <Composer
      ref={composerRef}
      busy={!!busy && isBusyHere}
      webSearch={webSearch}
      onToggleWebSearch={() => setWebSearch((w) => !w)}
      onSend={send}
      onStop={stop}
      onError={setToast}
      autoFocus
    />
  );

  return (
    <div
      className="app"
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) composerRef.current?.addFiles(e.dataTransfer.files);
      }}
    >
      <Sidebar
        chats={chats}
        activeId={activeId}
        collapsed={collapsed}
        hasApiKey={!!settings?.hasApiKey}
        onToggle={() => setCollapsed((c) => !c)}
        onNew={newChat}
        onSelect={(id) => {
          setActiveId(id);
          stickRef.current = true;
        }}
        onRename={(id, title) => updateChat(id, (c) => ({ ...c, title }))}
        onDelete={deleteChat}
        onPin={(id) => updateChat(id, (c) => ({ ...c, pinned: !c.pinned }))}
        onOpenSettings={() => setSettingsOpen({})}
      />

      <main className="main">
        <header className="topbar" data-tauri-drag-region>
          <span className="chat-heading">{active?.title}</span>
          {updateStatus.state === "available" && (
            <button
              id="update-available-chip"
              className="update-chip"
              onClick={() => setSettingsOpen({})}
              title="Update is available — click to view"
            >
              <span className="dot update" />
              <IconDownload size={13} />
              v{updateStatus.version} available
            </button>
          )}
          {updateStatus.state === "downloading" && (
            <div className="update-chip downloading" title="Downloading update in background">
              <IconRefresh size={13} className="spin" />
              Updating {updateStatus.progress ?? 0}%
            </div>
          )}
          {updateStatus.state === "ready" && (
            <button
              id="update-ready-chip"
              className="update-chip ready"
              onClick={() => updater.restartApp()}
              title="Click to restart and apply update"
            >
              <span className="dot update ready" />
              Restart to apply
            </button>
          )}

          <button id="model-chip" className="model-chip" onClick={() => setSettingsOpen({})} title="Models & settings">
            <span className={`dot ${settings?.hasApiKey ? "" : "off"}`} />
            <IconBolt size={15} />
            {settings ? modelLabel(settings.textModel) : "Groq"}
          </button>
          <WindowControls />
        </header>

        {!active ? (
          <section className="welcome">
            <div className="mascot">
              <img src={robot} alt="SachalAI robot" />
            </div>
            <h1>What's on your mind today?</h1>
            <div className="composer-wrap">
              {composer}
              <p className="disclaimer">SachalAI can make mistakes, double check important information.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.label}
                    className="suggestion"
                    style={{ animationDelay: `${200 + i * 60}ms` }}
                    onClick={() => {
                      if (s.image) {
                        document.querySelector<HTMLButtonElement>("#attach-image")?.click();
                        return;
                      }
                      if (s.web) setWebSearch(true);
                      composerRef.current?.setText(s.prompt);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
            <div
              className="thread"
              ref={threadRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
            >
              <div className="thread-inner">
                {active.messages.map((m, i) => (
                  <MessageView
                    key={m.id}
                    msg={m}
                    isLast={i === lastIdx}
                    onRegenerate={i === lastIdx && !busy ? regenerate : undefined}
                    onZoom={setZoom}
                  />
                ))}
              </div>
            </div>
            <div className="thread-composer">
              <div className="composer-wrap">
                {composer}
                <p className="disclaimer">SachalAI can make mistakes, double check important information.</p>
              </div>
            </div>
          </>
        )}
      </main>

      {settingsOpen && settings && (
        <SettingsModal
          settings={settings}
          notice={settingsOpen.notice}
          onClose={() => setSettingsOpen(null)}
          onSaved={setSettings}
          onClearChats={() => {
            if (busy) stop();
            setChats([]);
            setActiveId(null);
          }}
        />
      )}

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Preview" />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
