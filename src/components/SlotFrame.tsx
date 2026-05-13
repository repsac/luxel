import type { ReactNode } from "react";
import { VIEW_LABELS } from "../state/layoutStore";
import type { SlotId, ViewId } from "../state/sceneStore";
import { useSceneStore } from "../state/sceneStore";

interface Props {
  slot: SlotId;
  view: ViewId;
  children: ReactNode;
}

const ALL_VIEWS: ViewId[] = ["render", "editor", "console", "empty"];

/// A thin wrapper around any view that provides:
///  - a view picker (swap what this slot is showing)
///  - a maximize/restore toggle
///  - a hide button
/// The wrapped view's own header still renders inside; this frame just adds a
/// slim slot-level toolbar above it so layout controls don't pollute the
/// individual view components.
export default function SlotFrame({ slot, view, children }: Props) {
  const file = useSceneStore((s) => s.file);
  const setSlotView = useSceneStore((s) => s.setSlotView);
  const setSlotVisible = useSceneStore((s) => s.setSlotVisible);
  const setMaximized = useSceneStore((s) => s.setMaximized);
  if (!file) return null;
  const maximized = file.scene.layout.maximized;
  const isMaximized = maximized === slot;

  return (
    <div className="slot">
      <div className="slot-bar">
        <select
          value={view}
          onChange={(e) => setSlotView(slot, e.target.value as ViewId)}
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
          onClick={() => setMaximized(isMaximized ? null : slot)}
          title={isMaximized ? "Restore layout" : "Maximize this slot"}
        >
          {isMaximized ? "⤡ Restore" : "⤢ Max"}
        </button>
        <button
          onClick={() => setSlotVisible(slot, false)}
          title="Hide this slot — use the layout menu to bring it back"
        >
          ✕
        </button>
      </div>
      <div className="slot-body">{children}</div>
    </div>
  );
}
