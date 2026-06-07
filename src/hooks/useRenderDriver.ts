import { useEffect, useRef } from "react";
import { renderScene } from "../actions/render";
import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";

/// Viewport refresh driver — equivalent to a DCC viewport's auto-redraw plus
/// a playback engine.
///
/// A single `requestAnimationFrame` loop runs for the lifetime of the app.
/// Each tick:
///   1. If `isPlaying`, advances `scene.timeline.currentFrame` by `dt * targetFps`
///      in the active direction. Hitting either timeline bound auto-pauses.
///   2. Marks the scene dirty if anything that affects pixels changed.
///   3. If dirty AND no render is in flight, kicks off a GPU render. The
///      `iTime`/`iFrame` uniforms are derived from `currentFrame` and
///      `targetFps`.
export function useRenderDriver(): void {
  const file = useSceneStore((s) => s.file);
  const camera = file?.scene.camera;
  const shaderSource = file?.scene.shader.source;
  const objectPosition = file?.scene.object.position;
  const currentFrame = file?.scene.timeline.currentFrame;
  const targetFps = file?.scene.timeline.targetFps;
  const previewWidth = useAppStore((s) => s.previewWidth);
  const previewHeight = useAppStore((s) => s.previewHeight);
  const renderQuality = useAppStore((s) => s.renderQuality);

  const dirtyRef = useRef(true);
  const renderingRef = useRef(false);
  /// Fractional frame accumulator. Lets us advance a frame even when the
  /// real-time delta is less than one frame interval — we just bank the
  /// fraction and flip it into an integer step when it crosses 1.
  const frameAccumulatorRef = useRef(0);
  const lastTickMsRef = useRef<number | null>(null);

  useEffect(() => {
    dirtyRef.current = true;
  }, [
    camera,
    shaderSource,
    objectPosition,
    currentFrame,
    targetFps,
    previewWidth,
    previewHeight,
    renderQuality,
  ]);

  useEffect(() => {
    let alive = true;
    let handle = 0;

    const tick = (now: number) => {
      if (!alive) return;
      const last = lastTickMsRef.current ?? now;
      // Clamp dt so a tab-switch pause doesn't fast-forward the timeline by
      // several seconds on resume.
      const dt = Math.min(0.1, (now - last) / 1000);
      lastTickMsRef.current = now;

      const a = useAppStore.getState();
      const sceneFile = useSceneStore.getState().file;
      if (a.isPlaying && sceneFile) {
        const t = sceneFile.scene.timeline;
        const dir = a.playDirection;
        frameAccumulatorRef.current += dt * t.targetFps * dir;
        const step = Math.trunc(frameAccumulatorRef.current);
        if (step !== 0) {
          frameAccumulatorRef.current -= step;
          let next = t.currentFrame + step;
          let pause = false;
          if (next >= t.lastFrame) {
            next = t.lastFrame;
            pause = dir > 0;
          }
          if (next <= t.firstFrame) {
            next = t.firstFrame;
            pause = pause || dir < 0;
          }
          if (next !== t.currentFrame) {
            useSceneStore.getState().setCurrentFrame(next);
            dirtyRef.current = true;
          }
          if (pause) {
            useAppStore.getState().pause();
            frameAccumulatorRef.current = 0;
          }
        }
      } else {
        // Drop the accumulator while paused so resuming doesn't snap forward.
        frameAccumulatorRef.current = 0;
      }

      if (!renderingRef.current && dirtyRef.current && (a.autoRender || a.isPlaying)) {
        const current = useSceneStore.getState().file;
        const appState = useAppStore.getState();
        if (current && appState.previewWidth > 0 && appState.previewHeight > 0) {
          dirtyRef.current = false;
          renderingRef.current = true;
          const w = Math.max(
            16,
            Math.round(appState.previewWidth * appState.renderQuality),
          );
          const h = Math.max(
            16,
            Math.round(appState.previewHeight * appState.renderQuality),
          );
          const t = current.scene.timeline;
          const iFrame = t.currentFrame;
          const iTime = t.targetFps > 0 ? t.currentFrame / t.targetFps : 0;
          // No `isCurrent` here: during playback every tick advances the
          // playhead and re-dirties the scene, so a dirty-bit-based stale
          // check would discard every result. Renders are already serialized
          // by `renderingRef`, so we can't have a newer render superseding
          // this one in flight. Show every frame we produce — the worst
          // case is one animation frame of lag, which is what DCC viewports
          // do anyway.
          renderScene({
            scene: current,
            time: iTime,
            frame: iFrame,
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
