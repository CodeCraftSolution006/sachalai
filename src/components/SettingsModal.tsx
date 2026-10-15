import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Settings, SettingsUpdate } from "../types";
import { api, errorText } from "../lib/api";
import { updater, type UpdateStatus } from "../lib/updater";
import { IconCheck, IconDownload, IconExternal, IconEye, IconEyeOff, IconKey, IconRefresh, IconSettings, IconX } from "./Icons";

interface Props {
  settings: Settings;
  notice?: string;
  onClose: () => void;
  onSaved: (s: Settings) => void;
  onClearChats: () => void;
}

const EFFORTS = ["low", "medium", "high"];
const VISION_EFFORTS = ["none", "default", "low", "medium", "high"];

export default function SettingsModal({ settings, notice, onClose, onSaved, onClearChats }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({
    textModel: settings.textModel,
    visionModel: settings.visionModel,
    reasoningEffort: settings.reasoningEffort,
    visionReasoningEffort: settings.visionReasoningEffort,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    visionMaxTokens: settings.visionMaxTokens ?? 1000,
    systemPrompt: settings.systemPrompt,
  });
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(
    notice ? { kind: "info", text: notice } : null,
  );
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(updater.getStatus());

  useEffect(() => {
    return updater.subscribe(setUpdateStatus);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const test = async () => {
    setBusy(true);
    setStatus({ kind: "info", text: "Testing connection…" });
    try {
      const ids = await api.testConnection(apiKey.trim() || undefined);
      setModels(ids);
      const missing = [form.textModel, form.visionModel].filter((m) => !ids.includes(m));
      setStatus(
        missing.length
          ? { kind: "bad", text: `Connected, but not available on your key: ${missing.join(", ")}` }
          : { kind: "ok", text: `Connected ✓ ${ids.length} models available` },
      );
    } catch (e) {
      setStatus({ kind: "bad", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const update: SettingsUpdate = { ...form };
      if (apiKey.trim()) update.apiKey = apiKey.trim();
      const saved = await api.saveSettings(update);
      onSaved(saved);
      onClose();
    } catch (e) {
      setStatus({ kind: "bad", text: errorText(e) });
      setBusy(false);
    }
  };

  const removeKey = async () => {
    const saved = await api.saveSettings({ apiKey: "" });
    onSaved(saved);
    setStatus({ kind: "info", text: "API key removed." });
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-labelledby="settings-title">
        <div className="modal-head">
          <IconSettings size={22} />
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Groq connection, models and behaviour</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <div className="field-label">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <IconKey size={14} /> Groq API key
              </span>
              <button className="link-btn" onClick={() => openUrl("https://console.groq.com/keys")}>
                Get a free key <IconExternal size={12} />
              </button>
            </div>
            <div className="input-row">
              <div className="input-wrap">
                <input
                  id="api-key-input"
                  className="input"
                  type={showKey ? "text" : "password"}
                  placeholder={settings.hasApiKey ? `Saved (${settings.apiKeyHint}) — paste to replace` : "gsk_…"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="icon-btn" onClick={() => setShowKey((s) => !s)} title={showKey ? "Hide" : "Show"}>
                  {showKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
              <button id="test-connection" className="btn btn-ghost" onClick={test} disabled={busy || (!apiKey && !settings.hasApiKey)}>
                Test
              </button>
            </div>
            <small>
              Stored locally in your app data folder and used only by the Rust backend — it never leaves your PC except
              to call api.groq.com.
              {settings.hasApiKey && (
                <>
                  {" "}
                  <button className="link-btn" onClick={removeKey}>
                    Remove saved key
                  </button>
                </>
              )}
            </small>
          </div>

          <div className="section-title">Models</div>
          <datalist id="groq-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="text-model">Chat & web search</label>
              <input id="text-model" className="input" list="groq-models" value={form.textModel} onChange={(e) => set("textModel", e.target.value)} />
              <small>Default: openai/gpt-oss-20b</small>
            </div>
            <div className="field">
              <label htmlFor="vision-model">Image vision</label>
              <input id="vision-model" className="input" list="groq-models" value={form.visionModel} onChange={(e) => set("visionModel", e.target.value)} />
              <small>Default: qwen/qwen3.8-27b</small>
            </div>
          </div>

          <div className="field">
            <div className="field-label">GPT-OSS reasoning effort</div>
            <div className="segmented">
              {EFFORTS.map((e) => (
                <button key={e} className={form.reasoningEffort === e ? "on" : ""} onClick={() => set("reasoningEffort", e)}>
                  {e}
                </button>
              ))}
            </div>
            <small>Low is fastest and recommended with web search.</small>
          </div>

          <div className="field">
            <div className="field-label">Qwen vision reasoning</div>
            <div className="segmented">
              {VISION_EFFORTS.map((e) => (
                <button key={e} className={form.visionReasoningEffort === e ? "on" : ""} onClick={() => set("visionReasoningEffort", e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="section-title">Generation</div>
          <div className="grid-2">
            <div className="field">
              <div className="field-label">
                Temperature <span>{form.temperature.toFixed(1)}</span>
              </div>
              <input type="range" min={0} max={2} step={0.1} value={form.temperature} onChange={(e) => set("temperature", Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="max-tokens">Max response tokens</label>
              <input
                id="max-tokens"
                className="input"
                type="number"
                min={256}
                max={65536}
                step={256}
                value={form.maxTokens}
                onChange={(e) => set("maxTokens", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="vision-max-tokens">Max vision response tokens</label>
            <input
              id="vision-max-tokens"
              className="input"
              type="number"
              min={128}
              max={32768}
              step={100}
              value={form.visionMaxTokens}
              onChange={(e) => set("visionMaxTokens", Number(e.target.value))}
            />
            <small>
              Groq's free tier allows Qwen vision only ~1,000 output tokens per minute — keep this at 1000 unless you
              upgrade to the Dev tier.
            </small>
          </div>

          <div className="field">
            <label htmlFor="system-prompt">System prompt</label>
            <textarea id="system-prompt" className="textarea" value={form.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} />
          </div>

          <div className="section-title">Software Update</div>
          <div className="update-card">
            <div className="update-info-row">
              <div>
                <div className="update-app-name">SachalAI Desktop</div>
                <div className="update-version-label">
                  Installed version: <code>v0.1.0</code>
                </div>
              </div>
              <button
                id="check-updates-btn"
                className="btn btn-ghost"
                onClick={() => updater.checkForUpdates(true)}
                disabled={updateStatus.state === "checking" || updateStatus.state === "downloading"}
              >
                <IconRefresh size={14} className={updateStatus.state === "checking" ? "spin" : ""} />
                {updateStatus.state === "checking" ? "Checking…" : "Check for updates"}
              </button>
            </div>

            {updateStatus.state === "up-to-date" && (
              <div className="update-msg ok">
                <IconCheck size={15} /> SachalAI is up to date (v{updateStatus.currentVersion || "0.1.0"}).
              </div>
            )}

            {updateStatus.state === "available" && (
              <div className="update-banner-available">
                <div className="update-banner-header">
                  <span className="update-badge">v{updateStatus.version} Available</span>
                  {updateStatus.notes && <p className="update-notes">{updateStatus.notes}</p>}
                </div>
                <button className="btn btn-primary" onClick={() => updater.downloadAndInstall()}>
                  <IconDownload size={15} /> Update Now
                </button>
              </div>
            )}

            {updateStatus.state === "downloading" && (
              <div className="update-progress-box">
                <div className="update-progress-label">
                  <span>Downloading update…</span>
                  <span>{updateStatus.progress ?? 0}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${updateStatus.progress ?? 0}%` }} />
                </div>
              </div>
            )}

            {updateStatus.state === "ready" && (
              <div className="update-ready-box">
                <div className="update-msg ok" style={{ margin: 0 }}>
                  <IconCheck size={16} /> Update downloaded & installed!
                </div>
                <button className="btn btn-primary" onClick={() => updater.restartApp()}>
                  <IconRefresh size={14} /> Restart SachalAI
                </button>
              </div>
            )}

            {updateStatus.state === "error" && (
              <div className="update-msg bad">
                <span>{updateStatus.error}</span>
              </div>
            )}
          </div>

          <div className="section-title">Data</div>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (!confirmClear) return setConfirmClear(true);
              onClearChats();
              setConfirmClear(false);
              setStatus({ kind: "info", text: "All chats deleted." });
            }}
          >
            {confirmClear ? "Click again to confirm" : "Delete all chats"}
          </button>
        </div>

        <div className="modal-foot">
          <span className={`status ${status?.kind === "ok" ? "ok" : status?.kind === "bad" ? "bad" : ""}`}>{status?.text}</span>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button id="save-settings" className="btn btn-primary" onClick={save} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
