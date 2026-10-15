import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateStatus {
  state: "idle" | "checking" | "available" | "up-to-date" | "downloading" | "ready" | "error";
  update?: Update;
  version?: string;
  currentVersion?: string;
  notes?: string;
  progress?: number; // 0 to 100
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
}

export type UpdateListener = (status: UpdateStatus) => void;

class UpdaterService {
  private currentUpdate: Update | null = null;
  private status: UpdateStatus = { state: "idle" };
  private listeners = new Set<UpdateListener>();

  subscribe(listener: UpdateListener) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(status: UpdateStatus) {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  getStatus() {
    return this.status;
  }

  async checkForUpdates(manual = false): Promise<UpdateStatus> {
    const IN_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!IN_TAURI) {
      const s: UpdateStatus = {
        state: "error",
        error: "Auto-updater is only available inside the desktop app.",
      };
      if (manual) this.notify(s);
      return s;
    }

    try {
      this.notify({ state: "checking" });
      const update = await check();

      if (update?.available) {
        this.currentUpdate = update;
        const s: UpdateStatus = {
          state: "available",
          update,
          version: update.version,
          currentVersion: update.currentVersion,
          notes: update.body || undefined,
        };
        this.notify(s);
        return s;
      } else {
        this.currentUpdate = null;
        const s: UpdateStatus = {
          state: "up-to-date",
          currentVersion: update?.currentVersion || "0.1.0",
        };
        this.notify(s);
        return s;
      }
    } catch (err: unknown) {
      const errorMsg =
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : JSON.stringify(err);
      const s: UpdateStatus = {
        state: "error",
        error: errorMsg,
      };
      this.notify(s);
      return s;
    }
  }

  async downloadAndInstall(): Promise<void> {
    if (!this.currentUpdate) return;

    try {
      let downloaded = 0;
      let total = 0;

      this.notify({
        state: "downloading",
        update: this.currentUpdate,
        version: this.currentUpdate.version,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
      });

      await this.currentUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            this.notify({
              state: "downloading",
              update: this.currentUpdate!,
              version: this.currentUpdate!.version,
              progress: total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0,
              downloadedBytes: downloaded,
              totalBytes: total,
            });
            break;
          case "Finished":
            this.notify({
              state: "ready",
              update: this.currentUpdate!,
              version: this.currentUpdate!.version,
              progress: 100,
            });
            break;
        }
      });

      this.notify({
        state: "ready",
        update: this.currentUpdate,
        version: this.currentUpdate.version,
        progress: 100,
      });
    } catch (err: unknown) {
      const errorMsg =
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : JSON.stringify(err);
      this.notify({
        state: "error",
        error: `Update failed: ${errorMsg}`,
      });
    }
  }

  async restartApp() {
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch:", err);
    }
  }
}

export const updater = new UpdaterService();
