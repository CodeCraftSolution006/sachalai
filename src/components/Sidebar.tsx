import { useEffect, useMemo, useRef, useState } from "react";
import type { Chat } from "../types";
import robot from "../assets/robot.jpg";
import {
  IconDots,
  IconEdit,
  IconPin,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSidebar,
  IconTrash,
} from "./Icons";

interface Props {
  chats: Chat[];
  activeId: string | null;
  collapsed: boolean;
  hasApiKey: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onOpenSettings: () => void;
}

export default function Sidebar(p: Props) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  useEffect(() => renameRef.current?.select(), [renaming]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...p.chats].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt,
    );
    if (!q) return list;
    return list.filter(
      (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [p.chats, query]);

  const commitRename = () => {
    if (renaming && draft.trim()) p.onRename(renaming, draft.trim());
    setRenaming(null);
  };

  const menuChat = menu && p.chats.find((c) => c.id === menu.id);

  return (
    <aside className={`sidebar ${p.collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <img src={robot} alt="" />
          {!p.collapsed && <span>SachalAI</span>}
        </div>
        <button id="toggle-sidebar" className="icon-btn" title="Toggle sidebar (Ctrl+B)" onClick={p.onToggle}>
          <IconSidebar size={20} />
        </button>
      </div>

      <button id="new-chat" className="new-chat" onClick={p.onNew} title="New chat (Ctrl+N)">
        <span className="plus">
          <IconPlus size={16} />
        </span>
        {!p.collapsed && <span>New Chat</span>}
      </button>

      {!p.collapsed && (
        <>
          <div className="search-box">
            <input
              id="search-chats"
              placeholder="Search the chats"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <IconSearch size={18} />
          </div>

          <div className="sidebar-divider" />
          <p className="section-label">Last Chats</p>

          <div className="chat-list">
            {visible.length === 0 && (
              <div className="empty-list">
                {query ? "No chats match your search." : "Your conversations will appear here."}
              </div>
            )}
            {visible.map((c, i) => (
              <div
                key={c.id}
                id={`chat-${c.id}`}
                className={`chat-item ${c.id === p.activeId ? "active" : ""}`}
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                onClick={() => renaming !== c.id && p.onSelect(c.id)}
                onDoubleClick={() => {
                  setRenaming(c.id);
                  setDraft(c.title);
                }}
              >
                {renaming === c.id ? (
                  <input
                    ref={renameRef}
                    className="rename"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    {c.pinned && <IconPin size={13} className="pin" />}
                    <span className="title">{c.title}</span>
                  </>
                )}
                <button
                  className="more"
                  title="More"
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenu(menu?.id === c.id ? null : { id: c.id, x: r.right - 8, y: r.bottom + 4 });
                  }}
                >
                  <IconDots size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {p.collapsed && <div style={{ flex: 1 }} />}

      <div className="sidebar-bottom">
        <button id="open-settings" className="settings-btn" onClick={p.onOpenSettings} title="Settings">
          <IconSettings size={20} />
          {!p.collapsed && <span>Settings</span>}
          {!p.collapsed && !p.hasApiKey && <span className="key-warning" title="API key not set" />}
        </button>
      </div>

      {menu && menuChat && (
        <div className="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setRenaming(menuChat.id);
              setDraft(menuChat.title);
              setMenu(null);
            }}
          >
            <IconEdit size={15} /> Rename
          </button>
          <button
            onClick={() => {
              p.onPin(menuChat.id);
              setMenu(null);
            }}
          >
            <IconPin size={15} /> {menuChat.pinned ? "Unpin" : "Pin to top"}
          </button>
          <button
            className="danger"
            onClick={() => {
              p.onDelete(menuChat.id);
              setMenu(null);
            }}
          >
            <IconTrash size={15} /> Delete
          </button>
        </div>
      )}
    </aside>
  );
}
