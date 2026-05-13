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
  isCurrent?: () => boolean;
}

/// Size (in bytes) of the metadata header prepended to the pixel payload on
/// the Tauri side. Keep in sync with `RENDER_HEADER_BYTES` in
/// `src-tauri/src/commands.rs`. Layout (little-endian u32 each):
///   [0..4]  width
///   [4..8]  height
///   [8..12] total_ms
///   [12..16] gpu_ms
///   [16..]  RGBA8 pixels, row-major, top-to-bottom
export const RENDER_HEADER_BYTES = 16;

interface DecodedRender {
  width: number;
  height: number;
  totalMs: number;
  gpuMs: number;
  /// Tied to a concrete `ArrayBuffer` (not `ArrayBufferLike`) so it can be
  /// passed directly to `new ImageData(...)`, which insists on a non-shared
  /// backing buffer.
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

/// Parse the binary `render_single_frame` payload. We avoid `atob`/base64
/// entirely and never copy the pixel data — the returned `Uint8ClampedArray`
/// is a view onto the original `ArrayBuffer` that came over the IPC boundary.
export function decodeRenderPayload(buffer: ArrayBuffer): DecodedRender {
  if (buffer.byteLength < RENDER_HEADER_BYTES) {
    throw new Error(
      `render payload too small: ${buffer.byteLength} bytes (need at least ${RENDER_HEADER_BYTES})`,
    );
  }
  const header = new DataView(buffer, 0, RENDER_HEADER_BYTES);
  const width = header.getUint32(0, true);
  const height = header.getUint32(4, true);
  const totalMs = header.getUint32(8, true);
  const gpuMs = header.getUint32(12, true);
  const expected = width * height * 4;
  const pixelBytes = buffer.byteLength - RENDER_HEADER_BYTES;
  if (pixelBytes !== expected) {
    throw new Error(
      `render payload pixel size mismatch: got ${pixelBytes}, expected ${expected} (${width}x${height} RGBA8)`,
    );
  }
  const pixels = new Uint8ClampedArray(
    buffer,
    RENDER_HEADER_BYTES,
    expected,
  ) as Uint8ClampedArray<ArrayBuffer>;
  return { width, height, totalMs, gpuMs, pixels };
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
    const raw = await invoke<ArrayBuffer>("render_single_frame", args);
    if (req.isCurrent && !req.isCurrent()) return;
    const decoded = decodeRenderPayload(raw);
    setLastRender({
      totalMs: decoded.totalMs,
      width: decoded.width,
      height: decoded.height,
      pixels: decoded.pixels,
    });
    // Record the completion timestamp BEFORE flipping status to "compiled" so
    // the FPS overlay re-renders with the freshest history.
    useAppStore.getState().recordRenderCompleted();
    setShaderError(null);
    setShaderDiagnostics([]);
    setShaderStatus("compiled");
  } catch (e) {
    if (req.isCurrent && !req.isCurrent()) return;
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
