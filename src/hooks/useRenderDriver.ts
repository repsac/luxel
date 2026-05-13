import { useEffect, useRef } from "react";
import { renderScene } from "../actions/render";
import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";

/// Viewport refresh driver — the equivalent of a DCC viewport's auto-redraw.
///
/// A single `requestAnimationFrame` loop runs for the lifetime of the app.
/// Each tick:
///   1. Checks whether the scene is "dirty" (something that affects pixels
///      changed since the last render).
///   2. If dirty AND no render is in flight, kicks off a GPU render at the
///      current preview resolution.
///   3. Schedules the next tick via RAF.
///
/// The point of the loop (vs. an event-driven render) is to coalesce bursts
/// of input changes — like 60+ mouse-move events during a drag — into one
/// render per animation frame. End-to-end latency drops from ~60ms of trailing
/// debounce to one animation frame.
///
/// When the scene is idle (no inputs changing), the loop still ticks but does
/// no GPU work — RAF callbacks with an early-out are essentially free.
export function useRenderDriver(): void {
  const file = useSceneStore((s) => s.file);
  const camera = file?.scene.camera;
  const shaderSource = file?.scene.shader.source;

  const iTime = useAppStore((s) => s.iTime);
  const iFrame = useAppStore((s) => s.iFrame);
  const previewWidth = useAppStore((s) => s.previewWidth);
  const previewHeight = useAppStore((s) => s.previewHeight);
  const renderQuality = useAppStore((s) => s.renderQuality);

  const dirtyRef = useRef(true);
  const renderingRef = useRef(false);

  // Anything that affects pixels marks the scene dirty for the next frame.
  useEffect(() => {
    dirtyRef.current = true;
  }, [
    camera,
    shaderSource,
    iTime,
    iFrame,
    previewWidth,
    previewHeight,
    renderQuality,
  ]);

  useEffect(() => {
    let alive = true;
    let handle = 0;

    const tick = () => {
      if (!alive) return;

      if (!renderingRef.current && dirtyRef.current) {
        const current = useSceneStore.getState().file;
        const a = useAppStore.getState();
        if (current && a.previewWidth > 0 && a.previewHeight > 0) {
          dirtyRef.current = false;
          renderingRef.current = true;
          const w = Math.max(16, Math.round(a.previewWidth * a.renderQuality));
          const h = Math.max(16, Math.round(a.previewHeight * a.renderQuality));
          renderScene({
            scene: current,
            time: a.iTime,
            frame: a.iFrame,
            width: w,
            height: h,
          }).finally(() => {
            renderingRef.current = false;
          });
        }
      }

      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (handle) cancelAnimationFrame(handle);
    };
  }, []);
}
