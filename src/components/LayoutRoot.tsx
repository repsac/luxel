import { useRef, type ReactNode } from "react";
import {
  type LayoutShape,
  type SlotState,
  type ViewId,
  useSceneStore,
} from "../state/sceneStore";
import RenderView from "./RenderView";
import ShaderEditor from "./ShaderEditor";
import ConsolePanel from "./ConsolePanel";
import InspectorPanel from "./InspectorPanel";
import Scratchpad from "./Scratchpad";
import StatusLine from "./StatusLine";
import Toolbar from "./Toolbar";
import PlaybackBar from "./PlaybackBar";
import Splitter from "./Splitter";
import SlotFrame from "./SlotFrame";

const MIN_FRACTION = 0.08;

export default function LayoutRoot() {
  const file = useSceneStore((s) => s.file);
  const setLayoutSizes = useSceneStore((s) => s.setLayoutSizes);

  const mainRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const rightColRef = useRef<HTMLDivElement | null>(null);

  if (!file) {
    return <div className="loading">Loading Luxel…</div>;
  }

  const layout = file.scene.layout;

  // Maximized branch — single panel fills the whole main area regardless of
  // shape. We render the maximized slot's frame so the user still sees the
  // "restore" button to come back.
  if (layout.maximized != null && layout.maximized < layout.slots.length) {
    const i = layout.maximized;
    const s = layout.slots[i];
    return (
      <Shell>
        <div className="cell" style={{ width: "100%", height: "100%" }}>
          <SlotFrame slotIndex={i} view={s.view}>
            {renderView(s.view)}
          </SlotFrame>
        </div>
      </Shell>
    );
  }

  const slots = layout.slots;
  const primary = clamp(layout.sizes.primary, MIN_FRACTION, 1 - MIN_FRACTION);
  const secondary = clamp(layout.sizes.secondary, MIN_FRACTION, 1 - MIN_FRACTION);

  const onPrimary = (v: number) => setLayoutSizes({ primary: v });
  const onSecondary = (v: number) => setLayoutSizes({ secondary: v });

  let content: ReactNode;
  switch (layout.shape) {
    case "single":
      content = <SlotCell index={0} slot={slots[0]} />;
      break;

    case "twoAcross":
      content = (
        <div className="row" style={{ height: "100%" }} ref={mainRef}>
          <Cell width={primary}>
            <SlotCell index={0} slot={slots[0]} />
          </Cell>
          <Splitter
            orientation="vertical"
            fraction={primary}
            containerRef={mainRef}
            onFractionChange={onPrimary}
          />
          <Cell width={1 - primary}>
            <SlotCell index={1} slot={slots[1]} />
          </Cell>
        </div>
      );
      break;

    case "twoTopOneBottom":
      content = (
        <Stack
          mainRef={mainRef}
          primary={primary}
          onPrimary={onPrimary}
          top={
            <div className="row" style={{ height: "100%" }} ref={topRef}>
              <Cell width={secondary}>
                <SlotCell index={0} slot={slots[0]} />
              </Cell>
              <Splitter
                orientation="vertical"
                fraction={secondary}
                containerRef={topRef}
                onFractionChange={onSecondary}
              />
              <Cell width={1 - secondary}>
                <SlotCell index={1} slot={slots[1]} />
              </Cell>
            </div>
          }
          bottom={<SlotCell index={2} slot={slots[2]} />}
        />
      );
      break;

    case "oneTopTwoBottom":
      content = (
        <Stack
          mainRef={mainRef}
          primary={primary}
          onPrimary={onPrimary}
          top={<SlotCell index={0} slot={slots[0]} />}
          bottom={
            <div className="row" style={{ height: "100%" }} ref={bottomRef}>
              <Cell width={secondary}>
                <SlotCell index={1} slot={slots[1]} />
              </Cell>
              <Splitter
                orientation="vertical"
                fraction={secondary}
                containerRef={bottomRef}
                onFractionChange={onSecondary}
              />
              <Cell width={1 - secondary}>
                <SlotCell index={2} slot={slots[2]} />
              </Cell>
            </div>
          }
        />
      );
      break;

    case "oneLeftTwoRight":
      content = (
        <div className="row" style={{ height: "100%" }} ref={mainRef}>
          <Cell width={primary}>
            <SlotCell index={0} slot={slots[0]} />
          </Cell>
          <Splitter
            orientation="vertical"
            fraction={primary}
            containerRef={mainRef}
            onFractionChange={onPrimary}
          />
          <Cell width={1 - primary}>
            <div className="column-stack" ref={rightColRef}>
              <CellVertical height={secondary}>
                <SlotCell index={1} slot={slots[1]} />
              </CellVertical>
              <Splitter
                orientation="horizontal"
                fraction={secondary}
                containerRef={rightColRef}
                onFractionChange={onSecondary}
              />
              <CellVertical height={1 - secondary}>
                <SlotCell index={2} slot={slots[2]} />
              </CellVertical>
            </div>
          </Cell>
        </div>
      );
      break;

    case "twoLeftOneRight":
      content = (
        <div className="row" style={{ height: "100%" }} ref={mainRef}>
          <Cell width={primary}>
            <div className="column-stack" ref={leftColRef}>
              <CellVertical height={secondary}>
                <SlotCell index={0} slot={slots[0]} />
              </CellVertical>
              <Splitter
                orientation="horizontal"
                fraction={secondary}
                containerRef={leftColRef}
                onFractionChange={onSecondary}
              />
              <CellVertical height={1 - secondary}>
                <SlotCell index={1} slot={slots[1]} />
              </CellVertical>
            </div>
          </Cell>
          <Splitter
            orientation="vertical"
            fraction={primary}
            containerRef={mainRef}
            onFractionChange={onPrimary}
          />
          <Cell width={1 - primary}>
            <SlotCell index={2} slot={slots[2]} />
          </Cell>
        </div>
      );
      break;

    case "threeAcross": {
      // primary = boundary between slot 0 and the (slot 1 + slot 2) area.
      // secondary = boundary inside that remainder between slot 1 and slot 2.
      const rest = 1 - primary;
      const middle = rest * secondary;
      const right = rest - middle;
      content = (
        <div className="row" style={{ height: "100%" }} ref={mainRef}>
          <Cell width={primary}>
            <SlotCell index={0} slot={slots[0]} />
          </Cell>
          <Splitter
            orientation="vertical"
            fraction={primary}
            containerRef={mainRef}
            onFractionChange={onPrimary}
          />
          <Cell width={middle}>
            <SlotCell index={1} slot={slots[1]} />
          </Cell>
          <Splitter
            orientation="vertical"
            // The second splitter's "absolute" position is primary + middle.
            fraction={primary + middle}
            containerRef={mainRef}
            onFractionChange={(f) => {
              // Convert the absolute drag position back into "secondary"
              // (fraction inside the remainder).
              if (rest <= MIN_FRACTION) return;
              const newSecondary = clamp(
                (f - primary) / rest,
                MIN_FRACTION,
                1 - MIN_FRACTION,
              );
              onSecondary(newSecondary);
            }}
          />
          <Cell width={right}>
            <SlotCell index={2} slot={slots[2]} />
          </Cell>
        </div>
      );
      break;
    }

    case "twoByTwo":
      // 2x2 grid: top row [0,1], bottom row [2,3]. `primary` is the top/bottom
      // split; both rows share `secondary` for the left/right split so the
      // columns stay aligned.
      content = (
        <Stack
          mainRef={mainRef}
          primary={primary}
          onPrimary={onPrimary}
          top={
            <div className="row" style={{ height: "100%" }} ref={topRef}>
              <Cell width={secondary}>
                <SlotCell index={0} slot={slots[0]} />
              </Cell>
              <Splitter
                orientation="vertical"
                fraction={secondary}
                containerRef={topRef}
                onFractionChange={onSecondary}
              />
              <Cell width={1 - secondary}>
                <SlotCell index={1} slot={slots[1]} />
              </Cell>
            </div>
          }
          bottom={
            <div className="row" style={{ height: "100%" }} ref={bottomRef}>
              <Cell width={secondary}>
                <SlotCell index={2} slot={slots[2]} />
              </Cell>
              <Splitter
                orientation="vertical"
                fraction={secondary}
                containerRef={bottomRef}
                onFractionChange={onSecondary}
              />
              <Cell width={1 - secondary}>
                <SlotCell index={3} slot={slots[3]} />
              </Cell>
            </div>
          }
        />
      );
      break;
  }

  return <Shell>{content}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="layout-root">
      <div className="toolbar-area">
        <Toolbar />
      </div>
      <div className="main-area">{children}</div>
      <div className="playback-area">
        <PlaybackBar />
      </div>
      <div className="status-area">
        <StatusLine />
      </div>
    </div>
  );
}

interface StackProps {
  mainRef: React.RefObject<HTMLDivElement>;
  primary: number;
  onPrimary: (v: number) => void;
  top: ReactNode;
  bottom: ReactNode;
}

function Stack({ mainRef, primary, onPrimary, top, bottom }: StackProps) {
  return (
    <div className="column-stack" ref={mainRef}>
      <CellVertical height={primary}>{top}</CellVertical>
      <Splitter
        orientation="horizontal"
        fraction={primary}
        containerRef={mainRef}
        onFractionChange={onPrimary}
      />
      <CellVertical height={1 - primary}>{bottom}</CellVertical>
    </div>
  );
}

function Cell({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div className="cell" style={{ width: `${width * 100}%`, height: "100%" }}>
      {children}
    </div>
  );
}

function CellVertical({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div className="cell" style={{ height: `${height * 100}%`, width: "100%" }}>
      {children}
    </div>
  );
}

function SlotCell({ index, slot }: { index: number; slot: SlotState }) {
  return (
    <SlotFrame slotIndex={index} view={slot.view}>
      {renderView(slot.view)}
    </SlotFrame>
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
    case "inspector":
      return <InspectorPanel />;
    case "scratchpad":
      return <Scratchpad />;
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

export type { LayoutShape };
