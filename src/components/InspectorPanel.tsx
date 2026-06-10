import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";

/// Standalone inspector panel for shader debugging. Shows the same pixel
/// metadata as the render-view footer bar, plus uniforms and camera state.
/// Font scales with Shift+Cmd/Ctrl +/- so it's readable during screencasts.
export default function InspectorPanel() {
  const file = useSceneStore((s) => s.file);
  const lastRender = useAppStore((s) => s.lastRender);
  const pixelInspector = useAppStore((s) => s.pixelInspector);
  const pixelInfo = useAppStore((s) => s.pixelInfo);
  const fontSize = useAppStore((s) => s.inspectorFontSize);

  if (!file) return null;

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
          <Row label="iMouse">0, 0, 0, 0</Row>
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

        <InspectorSection title="Pixel">
          {pixelInspector && pixelInfo ? (
            <>
              <Row label="Coordinate">
                {pixelInfo.px}, {pixelInfo.py}
              </Row>
              <Row label="UV">
                {pixelInfo.u.toFixed(4)}, {pixelInfo.v.toFixed(4)}
              </Row>
              <Row label="RGB">
                <span className="inspector-rgb">
                  {pixelInfo.r}, {pixelInfo.g}, {pixelInfo.b}
                  <span
                    className="pi-swatch"
                    style={{
                      background: `rgb(${pixelInfo.r},${pixelInfo.g},${pixelInfo.b})`,
                      width: `${fontSize}px`,
                      height: `${fontSize}px`,
                    }}
                  />
                </span>
              </Row>
              <Row label="Normalized">
                {(pixelInfo.r / 255).toFixed(3)},{" "}
                {(pixelInfo.g / 255).toFixed(3)},{" "}
                {(pixelInfo.b / 255).toFixed(3)}
              </Row>
            </>
          ) : (
            <Row label="">
              {pixelInspector
                ? "Hover over render"
                : "Enable Inspect in render view"}
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="inspector-section">
      <div className="inspector-section-title">{title}</div>
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
