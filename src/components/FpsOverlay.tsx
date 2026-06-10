import { useEffect, useState } from "react";
import { computeFps, useAppStore } from "../state/appStore";

/// Small heads-up FPS readout pinned to the top-left of the render view.
/// Shows the rolling render rate over the last two seconds plus the most
/// recent frame's total time (GPU + readback + JS handoff).
export default function FpsOverlay() {
  const show = useAppStore((s) => s.showFps);
  const samples = useAppStore((s) => s.renderTimestamps);
  const lastFrameMs = useAppStore((s) => s.lastRender?.totalMs ?? null);
  const lastRender = useAppStore((s) => s.lastRender);

  // The FPS reading depends on time-since-last-render, so it must update on
  // a timer even when no new render fires. 250ms is responsive enough that
  // the value visibly decays when navigation stops.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!show) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [show]);

  if (!show) return null;

  const now = performance.now();
  const fps = computeFps(samples, now);
  // Suppress noisy 0.x readings — pixel snap to 1 fps integers.
  const fpsLabel = fps >= 1 ? Math.round(fps).toString() : fps > 0 ? "<1" : "—";
  const frameLabel = lastFrameMs != null ? `${lastFrameMs} ms` : "—";
  const resLabel = lastRender ? `${lastRender.width}×${lastRender.height}` : "";

  return (
    <div className="fps-overlay" data-fresh={tick}>
      <div className="fps-row">
        <span className="fps-key">FPS</span>
        <span className="fps-value">{fpsLabel}</span>
      </div>
      <div className="fps-row">
        <span className="fps-key">Frame</span>
        <span className="fps-value">{frameLabel}</span>
      </div>
      {resLabel && (
        <div className="fps-row">
          <span className="fps-key">Size</span>
          <span className="fps-value">{resLabel}</span>
        </div>
      )}
    </div>
  );
}
