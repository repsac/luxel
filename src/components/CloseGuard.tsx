import { useEffect, useRef, useState } from "react";
import { useSceneStore } from "../state/sceneStore";
import { saveCurrentScene } from "../actions/scene";

/// Intercepts the OS window-close request when the scene has unsaved changes
/// and asks the user what to do (Save / Don't save / Cancel) via an in-app
/// modal. A native 2-button dialog can't offer all three choices, and losing
/// unsaved work to an accidental close is exactly what this guards against.
///
/// `window.onCloseRequested` fires for the OS close button; we `preventDefault`
/// and then `destroy()` the window once the user commits, which bypasses the
/// event (calling `close()` would just re-trigger it).
export default function CloseGuard() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // The current window handle, captured once. `unknown`-typed so this file
  // doesn't hard-depend on the Tauri types when running in a browser.
  const winRef = useRef<{ destroy: () => Promise<void> } | null>(null);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlisten: undefined | (() => void);
    (async () => {
      try {
        const mod = await import("@tauri-apps/api/window");
        const w = mod.getCurrentWindow();
        winRef.current = w;
        unlisten = await w.onCloseRequested((event) => {
          if (!useSceneStore.getState().dirty) return; // clean → let it close
          event.preventDefault();
          setOpen(true);
        });
      } catch {
        // Not running in the Tauri shell — nothing to guard.
      }
      if (cancelled && unlisten) unlisten();
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Focus the default (Save) action and wire Escape → Cancel while open.
  useEffect(() => {
    if (!open) return;
    saveBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const closeWindow = () => {
    void winRef.current?.destroy();
  };

  const onSave = async () => {
    setSaving(true);
    const ok = await saveCurrentScene();
    setSaving(false);
    // Only close if the save actually went through; if the user cancelled the
    // Save-As dialog (ok === false) keep the prompt up so they can choose again.
    if (ok) closeWindow();
  };

  return (
    <div
      className="help-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="help-modal close-guard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-guard-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="close-guard-title">Unsaved changes</h2>
        </header>
        <div className="help-body">
          <p>
            You have unsaved changes to this scene. Save them before closing?
          </p>
          <div className="close-guard-actions">
            <button
              ref={saveBtnRef}
              className="primary"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={closeWindow} disabled={saving}>
              Don't save
            </button>
            <button onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
