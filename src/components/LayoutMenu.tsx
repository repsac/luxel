import { useEffect, useRef, useState } from "react";
import {
  LAYOUT_PRESETS,
  reshapeSlots,
  useCustomLayouts,
} from "../state/layoutStore";
import type { LayoutState } from "../state/sceneStore";
import { useSceneStore } from "../state/sceneStore";

export default function LayoutMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const file = useSceneStore((s) => s.file);
  const setLayout = useSceneStore((s) => s.setLayout);
  const customs = useCustomLayouts();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
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

  function saveAsCustom() {
    if (!file) return;
    const name = window.prompt(
      "Save current layout as…",
      `Layout ${customs.list.length + 1}`,
    );
    if (!name) return;
    customs.save(name.trim(), file.scene.layout);
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
          <button className="dropdown-item" onClick={saveAsCustom}>
            + Save current as…
          </button>
        </div>
      )}
    </div>
  );
}
