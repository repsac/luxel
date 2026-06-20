// Scratchpad eval action: send a GLSL expression to the backend evaluator and
// return its value. Uniforms are prefilled from the current scene so results
// match the live shader, with optional overrides for probing hypotheticals.

import { invoke } from "../tauri/commands";
import { useSceneStore } from "../state/sceneStore";
import { useAppStore } from "../state/appStore";
import type { EvalResult } from "../components/scratchpadFormat";

export type { EvalResult };

export interface EvalOptions {
  /// Override iTime; defaults to the scene's current playhead time.
  time?: number;
  /// Extra GLSL placed before the generated main (snapshot variable
  /// declarations from the REPL).
  preamble?: string;
}

export async function evalExpression(
  expr: string,
  opts: EvalOptions = {},
): Promise<EvalResult> {
  const file = useSceneStore.getState().file;
  if (!file) throw new Error("no scene loaded");
  const app = useAppStore.getState();

  // iResolution matches what the live shader sees: the actual render size when
  // we have one, otherwise the preview size scaled by quality.
  const resolution: [number, number] = app.lastRender
    ? [app.lastRender.width, app.lastRender.height]
    : [
        Math.max(1, Math.round(app.previewWidth * app.renderQuality)),
        Math.max(1, Math.round(app.previewHeight * app.renderQuality)),
      ];

  const pin = app.pinnedPixel ?? { x: 0, y: 0 };
  const t = file.scene.timeline;
  const sceneTime = t.targetFps > 0 ? t.currentFrame / t.targetFps : 0;

  return invoke<EvalResult>("eval_glsl", {
    scene: file,
    expr,
    preamble: opts.preamble,
    resolution,
    pixel: [pin.x, pin.y],
    timeOverride: opts.time ?? sceneTime,
    frameOverride: t.currentFrame,
    mouseOverride: app.mouse,
  });
}
