import { useEffect, useRef, useState } from "react";
import {
  LAYOUT_PRESETS,
  reshapeSlots,
  useCustomLayouts,
  useDefaultLayout,
} from "../state/layoutStore";
import type { LayoutState } from "../state/sceneStore";
import { useSceneStore } from "../state/sceneStore";

export default function LayoutMenu() {
  const [open, setOpen] = useState(false);
  // When non-null, the "+ Save current as…" row is replaced by an inline
  // name input holding this value. window.prompt is unreliable in
  // wry/WKWebView (it can silently return null, making save impossible),
  // so the naming happens in-menu instead.
  const [savingName, setSavingName] = useState<string | null>(null);
  const saveInputRef = useRef<HTMLInputElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const file = useSceneStore((s) => s.file);
  const setLayout = useSceneStore((s) => s.setLayout);
  const customs = useCustomLayouts();
  const defaults = useDefaultLayout();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Reset the inline save row whenever the menu closes.
  useEffect(() => {
    if (!open) setSavingName(null);
  }, [open]);

  if (!file) return null;

  function apply(layout: LayoutState) {
    // Defensive: callers should already produce a slot list that matches the
    // shape, but reshapeSlots keeps us safe if a saved custom is out of sync.
    const fixed: LayoutState = {
      ...layout,
      slots: reshapeSlots(layout.slots, layout.shape),
    };
    setLayout(fixed);
    setOpen(false);
  }

  function beginSaveAsCustom() {
    setSavingName(`Layout ${customs.list.length + 1}`);
    // Focus after the conditional input mounts.
    requestAnimationFrame(() => saveInputRef.current?.select());
  }

  function commitSaveAsCustom() {
    if (!file) return;
    const name = savingName?.trim();
    if (!name) return;
    customs.save(name, file.scene.layout);
    setSavingName(null);
  }

  return (
    <div className="dropdown" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} title="Layout presets and view slots">
        Layout ▾
      </button>
      {open && (
        <div className="dropdown-menu wide">
          <div className="dropdown-section">Presets</div>
          {LAYOUT_PRESETS.map((p) => (
            <button
              key={p.id}
              className="dropdown-item"
              onClick={() => apply(p.build())}
              title={p.description}
            >
              {p.name}
            </button>
          ))}

          <div className="dropdown-section">Custom</div>
          {customs.list.length === 0 && (
            <div className="dropdown-empty">No saved layouts yet.</div>
          )}
          {customs.list.map((c) => (
            <div className="bookmark-row" key={c.id}>
              <button
                className="dropdown-item bookmark-item"
                onClick={() => apply(c.layout)}
                title={`Apply ${c.name}`}
              >
                {c.name}
              </button>
              <button
                className="bookmark-remove"
                onClick={() => customs.remove(c.id)}
                title={`Delete ${c.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {savingName === null ? (
            <button className="dropdown-item" onClick={beginSaveAsCustom}>
              + Save current as…
            </button>
          ) : (
            <div className="dropdown-save-row">
              <input
                ref={saveInputRef}
                type="text"
                value={savingName}
                onChange={(e) => setSavingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitSaveAsCustom();
                  if (e.key === "Escape") setSavingName(null);
                }}
                aria-label="Layout name"
              />
              <button
                onClick={commitSaveAsCustom}
                disabled={!savingName.trim()}
                title="Save this arrangement as a reusable custom layout"
              >
                Save
              </button>
            </div>
          )}

          <div className="dropdown-section">Default</div>
          <button
            className="dropdown-item"
            onClick={() => {
              defaults.setDefault(file.scene.layout);
              setOpen(false);
            }}
            title="Use the current arrangement for new scenes and on startup"
          >
            ★ Set current as default
          </button>
          {defaults.hasDefault && (
            <button
              className="dropdown-item"
              onClick={() => defaults.clearDefault()}
              title="New scenes will use the built-in default layout again"
            >
              Clear default layout
            </button>
          )}
        </div>
      )}
    </div>
  );
}
