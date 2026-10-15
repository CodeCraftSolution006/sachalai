import { Channel, invoke } from "@tauri-apps/api/core";
import type { Chat, Settings, SettingsUpdate, StreamEvent } from "../types";

export const api = {
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (update: SettingsUpdate) => invoke<Settings>("save_settings", { update }),
  testConnection: (apiKey?: string) => invoke<string[]>("test_connection", { apiKey: apiKey ?? null }),
  loadChats: () => invoke<Chat[]>("load_chats"),
  saveChats: (chats: Chat[]) => invoke<void>("save_chats", { chats }),
  cancelStream: (requestId: string) => invoke<void>("cancel_stream", { requestId }),

  /** Resolves when the stream finishes, rejects with a readable message on failure. */
  streamChat: (
    request: { requestId: string; mode: "text" | "vision"; messages: unknown[]; webSearch: boolean },
    onEvent: (e: StreamEvent) => void,
  ) => {
    const channel = new Channel<StreamEvent>();
    channel.onmessage = onEvent;
    return invoke<void>("chat_stream", { request, onEvent: channel });
  },
};

export const errorText = (e: unknown) =>
  typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
