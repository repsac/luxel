import { useEffect, useRef, useState } from "react";
import { LAYOUT_PRESETS, VIEW_LABELS } from "../state/layoutStore";
import type { SlotId } from "../state/sceneStore";
import { useSceneStore } from "../state/sceneStore";

const SLOT_ORDER: SlotId[] = ["topLeft", "topRight", "bottom"];

const SLOT_LABELS: Record<SlotId, string> = {
  topLeft: "Top-left",
  topRight: "Top-right",
  bottom: "Bottom",
};

export default function LayoutMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const file = useSceneStore((s) => s.file);
  const setLayout = useSceneStore((s) => s.setLayout);
  const setSlotVisible = useSceneStore((s) => s.setSlotVisible);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!file) return null;
  const slots = file.scene.layout.slots;

  return (
    <div className="dropdown" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} title="Layout presets and slot visibility">
        Layout ▾
      </button>
      {open && (
        <div className="dropdown-menu wide">
          <div className="dropdown-section">Presets</div>
          {LAYOUT_PRESETS.map((p) => (
            <button
              key={p.id}
              className="dropdown-item"
              onClick={() => {
                setLayout(p.build());
                setOpen(false);
              }}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
          <div className="dropdown-section">Slots</div>
          {SLOT_ORDER.map((id) => (
            <label key={id} className="dropdown-item slot-row">
              <input
                type="checkbox"
                checked={slots[id].visible}
                onChange={(e) => setSlotVisible(id, e.target.checked)}
              />
              <span>{SLOT_LABELS[id]}</span>
              <span className="slot-row-view">{VIEW_LABELS[slots[id].view]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
