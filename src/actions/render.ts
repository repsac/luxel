// Action helpers shared between the toolbar buttons and the Cmd/Ctrl+Enter
// keyboard shortcut.

import type { SceneFile } from "../state/sceneStore";
import { invoke } from "../tauri/commands";
import { useAppStore } from "../state/appStore";
import { useConsoleStore } from "../state/consoleStore";

export interface RenderRequest {
  scene: SceneFile;
  time?: number;
  frame?: number;
  width?: number;
  height?: number;
}

export interface RenderResultPayload {
  width: number;
  height: number;
  pixelBytes: number;
  pixelsBase64: string;
  timing: { totalMs: number; gpuMs: number };
}

export async function renderScene(req: RenderRequest): Promise<void> {
  const { setShaderStatus, setLastRender, setShaderError, setShaderDiagnostics } =
    useAppStore.getState();
  const append = useConsoleStore.getState().append;
  // Clear diagnostics up front so the new compile's events represent the
  // current state of the shader instead of accumulating across edits.
  setShaderDiagnostics([]);
  setShaderStatus("compiling");
  try {
    const args: Record<string, unknown> = { scene: req.scene };
    if (req.time !== undefined) args.timeOverride = req.time;
    if (req.frame !== undefined) args.frameOverride = req.frame;
    if (req.width !== undefined) args.widthOverride = req.width;
    if (req.height !== undefined) args.heightOverride = req.height;
    const result = (await invoke("render_single_frame", args)) as RenderResultPayload;
    setLastRender({
      totalMs: result.timing.totalMs,
      width: result.width,
      height: result.height,
      pixelsBase64: result.pixelsBase64,
    });
    // Record the completion timestamp BEFORE flipping status to "compiled" so
    // the FPS overlay re-renders with the freshest history.
    useAppStore.getState().recordRenderCompleted();
    setShaderError(null);
    setShaderDiagnostics([]);
    setShaderStatus("compiled");
  } catch (e) {
    setShaderStatus("error");
    append({
      timestamp: new Date().toISOString(),
      level: "error",
      source: "renderer",
      message: `render failed: ${String(e)}`,
    });
  }
}

/// Encode a canvas to PNG and trigger a browser-style download.
export async function exportCanvasAsPng(
  canvas: HTMLCanvasElement,
  suggestedName: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedName.endsWith(".png") ? suggestedName : `${suggestedName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve(a.download);
    }, "image/png");
  });
}
