import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Attachment } from "../types";
import { fileToAttachment } from "../lib/image";
import { MAX_IMAGES } from "../lib/chat";
import { IconArrowUp, IconEye, IconGlobe, IconPlus, IconStop, IconX } from "./Icons";

interface Props {
  busy: boolean;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  onSend: (text: string, images: Attachment[]) => void;
  onStop: () => void;
  onError: (msg: string) => void;
  autoFocus?: boolean;
}

export interface ComposerHandle {
  addFiles: (files: FileList | File[]) => void;
  setText: (t: string) => void;
  focus: () => void;
}

const Composer = forwardRef<ComposerHandle, Props>(function Composer(p, ref) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return p.onError(`You can attach up to ${MAX_IMAGES} images per message.`);
    if (list.length > room) p.onError(`Only ${MAX_IMAGES} images per message — extra images were skipped.`);
    try {
      const atts = await Promise.all(list.slice(0, room).map(fileToAttachment));
      setImages((prev) => [...prev, ...atts].slice(0, MAX_IMAGES));
    } catch (e) {
      p.onError(String(e));
    }
  };

  useImperativeHandle(ref, () => ({
    addFiles,
    setText: (t) => {
      setText(t);
      requestAnimationFrame(() => taRef.current?.focus());
    },
    focus: () => taRef.current?.focus(),
  }));

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [text]);

  useEffect(() => {
    if (p.autoFocus) taRef.current?.focus();
  }, [p.autoFocus]);

  const canSend = !p.busy && (text.trim().length > 0 || images.length > 0);

  const submit = () => {
    if (!canSend) return;
    p.onSend(text.trim(), images);
    setText("");
    setImages([]);
  };

  const hasImages = images.length > 0;

  return (
    <div
      className={`composer ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      {hasImages && (
        <div className="attachments">
          {images.map((a) => (
            <div className="thumb" key={a.id}>
              <img src={a.dataUrl} alt={a.name} />
              <button title="Remove" onClick={() => setImages((prev) => prev.filter((x) => x.id !== a.id))}>
                <IconX size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        id="composer-input"
        ref={taRef}
        rows={1}
        placeholder={hasImages ? "Ask something about the image…" : "Ask me anything"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.some((f) => f.type.startsWith("image/"))) {
            e.preventDefault();
            addFiles(files);
          }
        }}
      />

      <div className="composer-actions">
        <button id="attach-image" className="attach-btn" title="Attach images (or paste / drop)" onClick={() => fileRef.current?.click()}>
          <IconPlus size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          id="toggle-web-search"
          className={`pill ${p.webSearch && !hasImages ? "active" : ""}`}
          onClick={p.onToggleWebSearch}
          disabled={hasImages}
          title={hasImages ? "Web search isn't available for image questions" : "Let GPT-OSS browse the web (Groq browser search)"}
        >
          <IconGlobe />
          Search the web
        </button>

        <div className="spacer" />

        {hasImages && (
          <span className="vision-badge">
            <IconEye size={14} /> Qwen Vision
          </span>
        )}

        {p.busy ? (
          <button id="stop-generation" className="send-btn stop" title="Stop generating" onClick={p.onStop}>
            <IconStop size={14} />
          </button>
        ) : (
          <button id="send-message" className="send-btn" title="Send (Enter)" disabled={!canSend} onClick={submit}>
            <IconArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
});

export default Composer;
