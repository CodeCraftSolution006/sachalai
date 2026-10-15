import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Win = ReturnType<typeof getCurrentWindow>;

const getWin = (): Win | null => {
  try {
    return getCurrentWindow();
  } catch {
    return null; // not running inside Tauri
  }
};

/** Windows-style caption buttons: minimize, maximize/restore, close. */
export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getWin();
    if (!win) return;
    let unlisten: (() => void) | undefined;
    const sync = () => win.isMaximized().then(setMaximized).catch(() => {});
    sync();
    win
      .onResized(sync)
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const run = (fn: (w: Win) => Promise<void>) => () => {
    const w = getWin();
    if (w) fn(w).catch(console.error);
  };

  return (
    <div className="caption-buttons">
      <button id="wc-minimize" className="caption-btn" title="Minimize" aria-label="Minimize" onClick={run((w) => w.minimize())}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        id="wc-maximize"
        className="caption-btn"
        title={maximized ? "Restore Down" : "Maximize"}
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={run((w) => w.toggleMaximize())}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="2.5" width="7" height="7" />
            <path d="M2.5 2.5V0.5h7v7h-2" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button id="wc-close" className="caption-btn close" title="Close" aria-label="Close" onClick={run((w) => w.close())}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </div>
  );
}
