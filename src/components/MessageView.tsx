import { memo, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Message } from "../types";
import { cleanContent, modelLabel } from "../lib/chat";
import Markdown from "./Markdown";
import robot from "../assets/robot.jpg";
import { IconBrain, IconCheck, IconChevron, IconCopy, IconEye, IconGlobe, IconRefresh } from "./Icons";

interface Props {
  msg: Message;
  isLast: boolean;
  onRegenerate?: () => void;
  onZoom: (src: string) => void;
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function WaitNotice({ until, reason }: { until: number; reason?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <div className="wait-notice">
      <span className="wait-ring" />
      <span>
        Groq free-tier limit reached{reason ? ` (${reason})` : ""} —{" "}
        {left > 0 ? <>retrying automatically in <b>{left}s</b>…</> : "retrying now…"}
      </span>
    </div>
  );
}

function MessageView({ msg, isLast, onRegenerate, onZoom }: Props) {
  const [copied, setCopied] = useState(false);

  if (msg.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble-user">
          {!!msg.images?.length && (
            <div className="imgs">
              {msg.images.map((a) => (
                <img key={a.id} src={a.dataUrl} alt={a.name} onClick={() => onZoom(a.dataUrl)} />
              ))}
            </div>
          )}
          {msg.content}
        </div>
      </div>
    );
  }

  const streaming = msg.status === "streaming";
  const content = cleanContent(msg.content);
  const hasContent = content.trim().length > 0;
  const isVision = msg.model?.includes("qwen");
  const seconds = msg.durationMs ? (msg.durationMs / 1000).toFixed(1) : null;

  return (
    <div className="msg assistant">
      <div className="mascot small">
        <img src={robot} alt="" />
      </div>
      <div className="assistant-body">
        <div className="meta-row">
          <span className="model">{modelLabel(msg.model) || "SachalAI"}</span>
          {msg.webSearch && (
            <span className="tag">
              <IconGlobe size={11} /> Web
            </span>
          )}
          {isVision && (
            <span className="tag cyan">
              <IconEye size={11} /> Vision
            </span>
          )}
        </div>

        {!!msg.reasoning?.trim() && (
          <details className="reasoning" open={streaming && !hasContent}>
            <summary>
              <IconChevron size={13} className="chev" />
              <IconBrain size={14} />
              {streaming && !hasContent ? <span className="shimmer">Thinking…</span> : <span>Reasoning</span>}
            </summary>
            <div className="r-text">{msg.reasoning.trim()}</div>
          </details>
        )}

        {streaming && msg.waitUntil && <WaitNotice until={msg.waitUntil} reason={msg.waitReason} />}

        {streaming && !hasContent && msg.webSearch && !msg.waitUntil && (
          <div className="searching">
            <IconGlobe size={15} />
            <span className="shimmer">Searching the web…</span>
          </div>
        )}

        {streaming && !hasContent && !msg.reasoning && !msg.webSearch && !msg.waitUntil && (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}

        {hasContent && (
          <div className={`md ${streaming ? "cursor" : ""}`}>
            <Markdown text={content} />
          </div>
        )}

        {msg.status === "stopped" && !hasContent && <div className="md" style={{ color: "var(--text-3)" }}>Stopped.</div>}

        {msg.error && (
          <div className="error-card">
            <span>{msg.error}</span>
            {isLast && onRegenerate && <button onClick={onRegenerate}>Retry</button>}
          </div>
        )}

        {!!msg.sources?.length && (
          <div className="sources">
            {msg.sources.map((s) => (
              <button key={s.url} className="source" title={s.url} onClick={() => openUrl(s.url)}>
                <img src={`https://www.google.com/s2/favicons?domain=${host(s.url)}&sz=32`} alt="" />
                <span>{s.title}</span>
              </button>
            ))}
          </div>
        )}

        {!streaming && hasContent && (
          <div className={`msg-actions ${isLast ? "visible" : ""}`}>
            <button
              className="icon-btn"
              title="Copy"
              onClick={() => {
                navigator.clipboard.writeText(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            </button>
            {isLast && onRegenerate && (
              <button className="icon-btn" title="Regenerate" onClick={onRegenerate}>
                <IconRefresh size={15} />
              </button>
            )}
            {seconds && <span className="stat">{seconds}s</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageView);
