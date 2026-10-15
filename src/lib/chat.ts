import type { Attachment, Message, Source } from "../types";

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/-/g, "").slice(0, 16);

export const MAX_IMAGES = 3; // Groq vision limit per request
const MAX_HISTORY = 30;

/** Remove GPT-OSS browser citation markers like 【3†L4-L9】. */
export const cleanContent = (s: string) => s.replace(/【[^】]*】/g, "");

export const pickMode = (lastUser?: Message): "text" | "vision" =>
  lastUser?.images?.length ? "vision" : "text";

/**
 * Convert chat history into OpenAI-compatible messages.
 * Only the latest user turn carries real images (and only in vision mode);
 * older images become a short text note so GPT-OSS never receives image parts.
 */
export function buildApiMessages(history: Message[], mode: "text" | "vision") {
  const usable = history
    .filter((m) => m.status !== "error")
    .filter((m) => m.content.trim() || m.images?.length)
    .slice(-MAX_HISTORY);

  let lastUserIdx = -1;
  usable.forEach((m, i) => m.role === "user" && (lastUserIdx = i));

  return usable.map((m, i) => {
    if (m.role === "assistant") return { role: "assistant", content: cleanContent(m.content) };
    const imgs = m.images ?? [];
    if (mode === "vision" && i === lastUserIdx && imgs.length) {
      return {
        role: "user",
        content: [
          { type: "text", text: m.content.trim() || "Describe this image in detail." },
          ...imgs.slice(0, MAX_IMAGES).map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } })),
        ],
      };
    }
    const note = imgs.length ? `\n\n[The user attached ${imgs.length} image(s) earlier in the conversation.]` : "";
    return { role: "user", content: (m.content + note).trim() };
  });
}

/** Defensive extraction of sources from Groq `executed_tools` payloads (shape varies by tool). */
export function extractSources(tools: unknown, existing: Source[] = []): Source[] {
  const map = new Map(existing.map((s) => [s.url, s]));
  const add = (url: string, title?: string) => {
    if (!/^https?:\/\//i.test(url) || map.has(url)) return;
    let host = url;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* keep raw */
    }
    map.set(url, { url, title: (title || host).trim().slice(0, 120) });
  };
  const walk = (v: unknown, depth = 0) => {
    if (depth > 8 || v == null) return;
    if (typeof v === "string") {
      if (v.length < 20000) for (const m of v.matchAll(/https?:\/\/[^\s"'<>)\]】†]+/g)) add(m[0].replace(/[.,;]+$/, ""));
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.url === "string") add(o.url, typeof o.title === "string" ? o.title : undefined);
      for (const val of Object.values(o)) walk(val, depth + 1);
    }
  };
  walk(tools);
  return [...map.values()].slice(0, 12);
}

export const titleFrom = (text: string, images?: Attachment[]) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t) return t.length > 48 ? t.slice(0, 48) + "…" : t;
  return images?.length ? "Image analysis" : "New chat";
};

export const modelLabel = (id?: string) => {
  if (!id) return "";
  const known: Record<string, string> = {
    "openai/gpt-oss-20b": "GPT-OSS 20B",
    "openai/gpt-oss-120b": "GPT-OSS 120B",
    "qwen/qwen3.8-27b": "Qwen 3.8 Vision",
  };
  return known[id] ?? id.split("/").pop()!;
};
