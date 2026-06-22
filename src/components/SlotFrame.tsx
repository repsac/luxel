import type { ReactNode } from "react";
import { VIEW_LABELS } from "../state/layoutStore";
import type { ViewId } from "../state/sceneStore";
import { useSceneStore } from "../state/sceneStore";
import { useAppStore } from "../state/appStore";

interface Props {
  slotIndex: number;
  view: ViewId;
  children: ReactNode;
}

const ALL_VIEWS: ViewId[] = [
  "render",
  "editor",
  "console",
  "inspector",
  "scratchpad",
  "empty",
];

/// Thin slot-level toolbar above each panel: pick the view, maximize/restore.
export default function SlotFrame({ slotIndex, view, children }: Props) {
  const file = useSceneStore((s) => s.file);
  const setSlotView = useSceneStore((s) => s.setSlotView);
  const setMaximized = useSceneStore((s) => s.setMaximized);
  const setHoveredView = useAppStore((s) => s.setHoveredView);
  if (!file) return null;
  const maximized = file.scene.layout.maximized;
  const isMaximized = maximized === slotIndex;

  return (
    // Track which view the pointer is over so the font hotkey knows its
    // target. Not cleared on leave, so the last hovered panel stays the
    // target while the cursor is over chrome like the toolbar.
    <div className="slot" onMouseEnter={() => setHoveredView(view)}>
      <div className="slot-bar">
        <select
          value={view}
          onChange={(e) => setSlotView(slotIndex, e.target.value as ViewId)}
          title="Choose what this slot shows"
        >
          {ALL_VIEWS.map((v) => (
            <option key={v} value={v}>
              {VIEW_LABELS[v]}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button
          onClick={() => setMaximized(isMaximized ? null : slotIndex)}
          title={isMaximized ? "Restore layout" : "Maximize this slot"}
        >
          {isMaximized ? "⤡ Restore" : "⤢ Max"}
        </button>
      </div>
      <div className="slot-body">{children}</div>
    </div>
  );
}
