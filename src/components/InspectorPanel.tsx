import { useRef } from "react";
import { fontSizeForView, useAppStore, type PixelInfo } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";
import { pixelInfoAt } from "./pixelMath";

/// Standalone inspector panel for shader debugging. Shows the same pixel
/// metadata as the render-view footer bar, plus uniforms and camera state.
/// Font scales with the shared zoom hotkey while hovered.
export default function InspectorPanel() {
  const file = useSceneStore((s) => s.file);
  const lastRender = useAppStore((s) => s.lastRender);
  const pixelInspector = useAppStore((s) => s.pixelInspector);
  const pixelInfo = useAppStore((s) => s.pixelInfo);
  const mouse = useAppStore((s) => s.mouse);
  const pinnedPixel = useAppStore((s) => s.pinnedPixel);
  const setPinnedPixel = useAppStore((s) => s.setPinnedPixel);
  const fontSize = useAppStore((s) => fontSizeForView(s.viewFontSizes, "inspector"));

  // Retain the last sampled pixel so the four rows stay populated after the
  // cursor leaves the canvas, instead of collapsing to a hint. `pixelInfo`
  // is the live value (null when not hovering).
  const lastPixelRef = useRef<PixelInfo | null>(null);
  if (pixelInfo) lastPixelRef.current = pixelInfo;
  const hovering = pixelInfo != null;

  // A pinned pixel (set below) shows in the inspector even with interactive
  // Inspect off. It's null when the pinned coordinate is outside the current
  // render (e.g. the canvas shrank), which we surface as a note.
  const pinnedInfo =
    pinnedPixel && lastRender
      ? pixelInfoAt(lastRender, pinnedPixel.x, pinnedPixel.y)
      : null;
  // Display precedence: live hover → pinned pixel → last hovered value.
  const shownPixel = pixelInfo ?? pinnedInfo ?? lastPixelRef.current;
  // Pinned but out of range, and not actively hovering: show the note instead
  // of a stale value.
  const pinnedOutOfBounds =
    pinnedPixel != null && pinnedInfo == null && pixelInfo == null;

  if (!file) return null;

  const setPinX = (v: string) => {
    const x = parseInt(v, 10);
    if (Number.isNaN(x)) return;
    setPinnedPixel({ x, y: pinnedPixel?.y ?? 0 });
  };
  const setPinY = (v: string) => {
    const y = parseInt(v, 10);
    if (Number.isNaN(y)) return;
    setPinnedPixel({ x: pinnedPixel?.x ?? 0, y });
  };

  const t = file.scene.timeline;
  const cam = file.scene.camera;
  const iTime = t.targetFps > 0 ? t.currentFrame / t.targetFps : 0;

  return (
    <section className="panel inspector-panel">
      <header>
        <span>Inspector</span>
        <span className="meta" title="Shift+Cmd/Ctrl +/- to scale">
          {fontSize}px
        </span>
      </header>
      <div className="inspector-body" style={{ fontSize: `${fontSize}px` }}>
        <InspectorSection title="Uniforms">
          <Row label="iResolution">
            {lastRender
              ? `${lastRender.width}, ${lastRender.height}, 1.0`
              : "---"}
          </Row>
          <Row label="iTime">{iTime.toFixed(4)}</Row>
          <Row label="iFrame">{t.currentFrame}</Row>
          <Row label="iMouse">{mouse.map((n) => n.toFixed(1)).join(", ")}</Row>
        </InspectorSection>

        <InspectorSection title="Camera">
          <Row label="Position">
            {cam.position.map((n) => n.toFixed(3)).join(", ")}
          </Row>
          <Row label="Target">
            {cam.target.map((n) => n.toFixed(3)).join(", ")}
          </Row>
          <Row label="FOV">{cam.fovYDegrees.toFixed(1)}&deg;</Row>
          <Row label="Near / Far">
            {cam.near} / {cam.far}
          </Row>
        </InspectorSection>

        <InspectorSection
          title="Pixel"
          aside={
            hovering ? null : pinnedPixel ? (
              <span className="inspector-hint">
                pinned {pinnedPixel.x}, {pinnedPixel.y}
              </span>
            ) : !pixelInspector ? (
              <span className="inspector-hint">Inspect off</span>
            ) : (
              <span className="inspector-hint">Hover over render</span>
            )
          }
        >
          <div className="inspector-pin">
            <span className="inspector-label">Pin (x, y)</span>
            <input
              type="number"
              className="inspector-pin-input"
              value={pinnedPixel?.x ?? ""}
              onChange={(e) => setPinX(e.target.value)}
              placeholder="x"
              aria-label="Pinned pixel X"
            />
            <input
              type="number"
              className="inspector-pin-input"
              value={pinnedPixel?.y ?? ""}
              onChange={(e) => setPinY(e.target.value)}
              placeholder="y"
              aria-label="Pinned pixel Y"
            />
            {pinnedPixel && (
              <button onClick={() => setPinnedPixel(null)} title="Unpin">
                Clear
              </button>
            )}
          </div>
          {pinnedOutOfBounds ? (
            <Row label="">
              Pixel ({pinnedPixel.x}, {pinnedPixel.y}) is outside the current{" "}
              {lastRender ? `${lastRender.width}×${lastRender.height}` : ""}{" "}
              render.
            </Row>
          ) : shownPixel ? (
            <>
              <Row label="Coordinate">
                {shownPixel.px}, {shownPixel.py}
              </Row>
              <Row label="UV">
                {shownPixel.u.toFixed(4)}, {shownPixel.v.toFixed(4)}
              </Row>
              <Row label="RGB">
                <span className="inspector-rgb">
                  {shownPixel.r}, {shownPixel.g}, {shownPixel.b}
                  <span
                    className="pi-swatch"
                    style={{
                      background: `rgb(${shownPixel.r},${shownPixel.g},${shownPixel.b})`,
                      width: `${fontSize}px`,
                      height: `${fontSize}px`,
                    }}
                  />
                </span>
              </Row>
              <Row label="Normalized">
                {(shownPixel.r / 255).toFixed(3)},{" "}
                {(shownPixel.g / 255).toFixed(3)},{" "}
                {(shownPixel.b / 255).toFixed(3)}
              </Row>
            </>
          ) : (
            <Row label="">
              {pixelInspector
                ? "Hover the render, or pin a pixel above"
                : "Pin a pixel above, or enable Inspect"}
            </Row>
          )}
        </InspectorSection>

        <InspectorSection title="Render">
          <Row label="Resolution">
            {lastRender
              ? `${lastRender.width} x ${lastRender.height}`
              : "---"}
          </Row>
          <Row label="Render time">
            {lastRender ? `${lastRender.totalMs} ms` : "---"}
          </Row>
          <Row label="Target FPS">{t.targetFps}</Row>
        </InspectorSection>
      </div>
    </section>
  );
}

function InspectorSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="inspector-section">
      <div className="inspector-section-title">
        <span>{title}</span>
        {aside}
      </div>
      <div className="inspector-rows">{children}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="inspector-row">
      {label && <span className="inspector-label">{label}</span>}
      <span className="inspector-value">{children}</span>
    </div>
  );
}
