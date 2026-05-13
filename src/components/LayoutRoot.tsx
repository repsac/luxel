import { useRef, type ReactNode } from "react";
import { useSceneStore, type SlotId, type ViewId } from "../state/sceneStore";
import RenderView from "./RenderView";
import ShaderEditor from "./ShaderEditor";
import ConsolePanel from "./ConsolePanel";
import StatusLine from "./StatusLine";
import Toolbar from "./Toolbar";
import Splitter from "./Splitter";
import SlotFrame from "./SlotFrame";

export default function LayoutRoot() {
  const file = useSceneStore((s) => s.file);
  const setLayoutSizes = useSceneStore((s) => s.setLayoutSizes);

  const mainRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  if (!file) {
    return <div className="loading">Loading Luxel…</div>;
  }

  const layout = file.scene.layout;
  const slots = layout.slots;

  // Decide what's actually visible. A maximized slot overrides everything;
  // otherwise we honor each slot's visibility.
  const max = layout.maximized;
  const topLeftVisible = !max ? slots.topLeft.visible : max === "topLeft";
  const topRightVisible = !max ? slots.topRight.visible : max === "topRight";
  const bottomVisible = !max ? slots.bottom.visible : max === "bottom";

  const hasTop = topLeftVisible || topRightVisible;
  const hasBottom = bottomVisible;

  // Normalize fractions. If the bottom row is hidden it gets 0; if only the
  // top is hidden, the bottom takes the whole area.
  const bottomFrac =
    hasTop && hasBottom
      ? clamp(layout.sizes.bottomFraction, 0.05, 0.95)
      : hasBottom
        ? 1
        : 0;
  const topFrac = 1 - bottomFrac;

  const leftFrac =
    topLeftVisible && topRightVisible
      ? clamp(layout.sizes.topLeftFraction, 0.05, 0.95)
      : topLeftVisible
        ? 1
        : 0;

  return (
    <div className="layout-root">
      <div className="toolbar-area">
        <Toolbar />
      </div>
      <div className="main-area" ref={mainRef}>
        {hasTop && (
          <div className="row top-row" style={{ height: `${topFrac * 100}%` }} ref={topRef}>
            {topLeftVisible && (
              <div className="cell" style={{ width: `${leftFrac * 100}%` }}>
                <SlotFrame slot="topLeft" view={slots.topLeft.view}>
                  {renderView(slots.topLeft.view)}
                </SlotFrame>
              </div>
            )}
            {topLeftVisible && topRightVisible && (
              <Splitter
                orientation="vertical"
                fraction={leftFrac}
                containerRef={topRef}
                onFractionChange={(f) => setLayoutSizes({ topLeftFraction: f })}
              />
            )}
            {topRightVisible && (
              <div className="cell" style={{ width: `${(1 - leftFrac) * 100}%` }}>
                <SlotFrame slot="topRight" view={slots.topRight.view}>
                  {renderView(slots.topRight.view)}
                </SlotFrame>
              </div>
            )}
          </div>
        )}
        {hasTop && hasBottom && (
          <Splitter
            orientation="horizontal"
            fraction={topFrac}
            containerRef={mainRef}
            onFractionChange={(f) => setLayoutSizes({ bottomFraction: 1 - f })}
          />
        )}
        {hasBottom && (
          <div className="row bottom-row" style={{ height: `${bottomFrac * 100}%` }}>
            <div className="cell" style={{ width: "100%" }}>
              <SlotFrame slot="bottom" view={slots.bottom.view}>
                {renderView(slots.bottom.view)}
              </SlotFrame>
            </div>
          </div>
        )}
      </div>
      <div className="status-area">
        <StatusLine />
      </div>
    </div>
  );
}

function renderView(view: ViewId): ReactNode {
  switch (view) {
    case "render":
      return <RenderView />;
    case "editor":
      return <ShaderEditor />;
    case "console":
      return <ConsolePanel />;
    case "empty":
      return <EmptyView />;
  }
}

function EmptyView() {
  return (
    <div className="empty-view">
      <p>Empty slot — use the dropdown above to pick a view.</p>
    </div>
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// Avoid an unused warning when SlotId is only imported as a type alias above.
export type { SlotId };
