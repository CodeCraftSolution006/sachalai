export interface Attachment {
  id: string;
  name: string;
  dataUrl: string;
}

export interface Source {
  title: string;
  url: string;
}

export type MessageStatus = "streaming" | "done" | "error" | "stopped";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: Attachment[];
  reasoning?: string;
  sources?: Source[];
  model?: string;
  webSearch?: boolean;
  error?: string;
  status?: MessageStatus;
  createdAt: number;
  durationMs?: number;
  /** epoch ms until which the backend is waiting out a Groq rate limit */
  waitUntil?: number;
  waitReason?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface Settings {
  hasApiKey: boolean;
  apiKeyHint: string;
  textModel: string;
  visionModel: string;
  reasoningEffort: string;
  visionReasoningEffort: string;
  temperature: number;
  maxTokens: number;
  visionMaxTokens: number;
  systemPrompt: string;
}

export interface SettingsUpdate {
  apiKey?: string;
  textModel?: string;
  visionModel?: string;
  reasoningEffort?: string;
  visionReasoningEffort?: string;
  temperature?: number;
  maxTokens?: number;
  visionMaxTokens?: number;
  systemPrompt?: string;
}

export type StreamEvent =
  | { type: "start"; model: string }
  | { type: "content"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tools"; tools: unknown }
  | { type: "usage"; usage: unknown }
  | { type: "waiting"; seconds: number; reason: string }
  | { type: "done" };
