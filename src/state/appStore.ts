import { create } from "zustand";
import type { ConsoleEvent } from "./consoleStore";

export type ShaderStatus = "clean" | "compiling" | "compiled" | "error";

export interface PixelInfo {
  /// Pixel coordinate in render resolution (bottom-left origin).
  px: number;
  py: number;
  /// Resolution of the current render.
  resX: number;
  resY: number;
  /// Normalized UV (0-1). u=0 left, v=0 bottom (OpenGL convention).
  u: number;
  v: number;
  /// sRGB color at the pixel, 0-255.
  r: number;
  g: number;
  b: number;
}

export interface LastRender {
  totalMs: number;
  width: number;
  height: number;
  /// RGBA8 pixels, row-major top-to-bottom. Stored as a typed array so the
  /// render view can hand it straight to `ImageData` without `atob` or a copy.
  /// Length always equals `width * height * 4`. Pinned to a concrete
  /// `ArrayBuffer` so it satisfies the `ImageData` constructor's type bound.
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

export interface ShaderDiagnostic {
  message: string;
  line: number | null;
  column: number | null;
}

interface AppStore {
  shaderStatus: ShaderStatus;
  lastRender: LastRender | null;
  shaderDiagnostics: ShaderDiagnostic[];
  lastShaderError: ConsoleEvent | null;
  /// Whether the playback driver is currently advancing the timeline.
  isPlaying: boolean;
  /// +1 = play forward, -1 = play backward. Ignored when `isPlaying` is false.
  playDirection: 1 | -1;
  /// When true, playback wraps from last→first (or first→last when reversed)
  /// instead of auto-pausing at the timeline bounds.
  loopPlayback: boolean;
  renderCanvas: HTMLCanvasElement | null;
  /// Pixel size of the render viewport — drives iResolution so the preview
  /// always fills the panel. Cap is enforced by the consumer.
  previewWidth: number;
  previewHeight: number;
  /// Multiplier applied to preview size before it goes to the GPU. 1.0 is
  /// "native pixels"; 0.5 trades visual fidelity for a snappier drag.
  renderQuality: number;
  /// Whether to render the FPS overlay on top of the render view.
  showFps: boolean;
  /// Whether to draw the aspect-ratio frustum overlay rectangle on top of
  /// the render. Persisted across sessions so a user who turns it off
  /// doesn't have to keep toggling it on every scene load.
  showFrustumOverlay: boolean;
  /// Whether the move gizmo is active in the render view. When on, dragging
  /// an axis handle moves the object (iObjectPosition) instead of orbiting
  /// the camera. POC-grade; not persisted.
  gizmoEnabled: boolean;
  /// When true the render driver auto-renders on every change. When false,
  /// rendering only happens on explicit Render button / Cmd+Enter.
  autoRender: boolean;
  /// One-shot manual render request (Render button / Cmd+Enter). Consumed by
  /// the render driver so manual renders share its in-flight serialization —
  /// calling renderScene directly from the UI could race a driver render and
  /// publish frames out of order.
  renderRequested: boolean;
  /// Whether the pixel-inspector footer bar is visible in the render view.
  pixelInspector: boolean;
  /// Current pixel data under the cursor (null when not hovering the canvas).
  pixelInfo: PixelInfo | null;
  /// Shadertoy-convention iMouse, in render-resolution pixels with a
  /// bottom-left origin: xy = drag position (frozen on release), zw = click
  /// position, with z/w flipped negative while the button is up. Fed by
  /// left-drags on the render view.
  mouse: [number, number, number, number];
  /// Font size used in the inspector panel, in CSS pixels. Persisted via
  /// localStorage so it survives restarts.
  inspectorFontSize: number;
  /// Font size used in the GLSL editor, in CSS pixels. Persisted via
  /// localStorage so it survives restarts.
  editorFontSize: number;
  /// performance.now() timestamps of recent completed renders. Used to derive
  /// a rolling FPS without storing per-frame state in the scene file.
  renderTimestamps: number[];
  setShaderStatus: (s: ShaderStatus) => void;
  setLastRender: (r: LastRender) => void;
  setShaderError: (e: ConsoleEvent | null) => void;
  setShaderDiagnostics: (d: ShaderDiagnostic[]) => void;
  play: (direction?: 1 | -1) => void;
  pause: () => void;
  togglePlay: (direction?: 1 | -1) => void;
  setLoopPlayback: (on: boolean) => void;
  toggleLoopPlayback: () => void;
  setRenderCanvas: (c: HTMLCanvasElement | null) => void;
  setPreviewSize: (w: number, h: number) => void;
  setRenderQuality: (q: number) => void;
  setShowFps: (show: boolean) => void;
  toggleFps: () => void;
  setShowFrustumOverlay: (show: boolean) => void;
  toggleFrustumOverlay: () => void;
  setGizmoEnabled: (on: boolean) => void;
  toggleGizmo: () => void;
  setAutoRender: (on: boolean) => void;
  toggleAutoRender: () => void;
  requestRender: () => void;
  clearRenderRequest: () => void;
  setPixelInspector: (on: boolean) => void;
  togglePixelInspector: () => void;
  setPixelInfo: (info: PixelInfo | null) => void;
  setMouse: (m: [number, number, number, number]) => void;
  setInspectorFontSize: (size: number) => void;
  increaseInspectorFontSize: () => void;
  decreaseInspectorFontSize: () => void;
  resetInspectorFontSize: () => void;
  setEditorFontSize: (size: number) => void;
  increaseEditorFontSize: () => void;
  decreaseEditorFontSize: () => void;
  resetEditorFontSize: () => void;
  recordRenderCompleted: (now?: number) => void;
}

const AUTO_RENDER_KEY = "luxel.autoRender";
const PIXEL_INSPECTOR_KEY = "luxel.pixelInspector";
const INSPECTOR_FONT_KEY = "luxel.inspectorFontSize";
export const INSPECTOR_FONT_DEFAULT = 14;
const LOOP_PLAYBACK_KEY = "luxel.loopPlayback";
const SHOW_FPS_KEY = "luxel.showFps";
const SHOW_FRUSTUM_KEY = "luxel.showFrustumOverlay";
const EDITOR_FONT_KEY = "luxel.editorFontSize";
export const EDITOR_FONT_DEFAULT = 13;
export const EDITOR_FONT_MIN = 8;
export const EDITOR_FONT_MAX = 32;

function readStoredNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private/locked storage — silently ignore.
  }
}

function clampFont(size: number): number {
  if (!Number.isFinite(size)) return EDITOR_FONT_DEFAULT;
  return Math.max(EDITOR_FONT_MIN, Math.min(EDITOR_FONT_MAX, Math.round(size)));
}

/// Local-storage-backed read; never throws on private-mode failures.
function readStoredFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "true";
  } catch {
    return fallback;
  }
}

function writeStoredFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private/locked storage — silently ignore.
  }
}

/// Keep the last ~2 seconds of render completions so the rolling FPS reading
/// doesn't lag behind once the user starts/stops navigating.
const FPS_WINDOW_MS = 2000;
const FPS_MAX_SAMPLES = 240;

function trimTimestamps(samples: number[], now: number): number[] {
  const cutoff = now - FPS_WINDOW_MS;
  let i = 0;
  while (i < samples.length && samples[i] < cutoff) i++;
  const trimmed = i > 0 ? samples.slice(i) : samples;
  if (trimmed.length > FPS_MAX_SAMPLES) {
    return trimmed.slice(trimmed.length - FPS_MAX_SAMPLES);
  }
  return trimmed;
}

/// Compute rolling FPS from a list of render-completion timestamps and the
/// "now" time. Returns 0 if there isn't enough history.
export function computeFps(samples: number[], now: number): number {
  const window = trimTimestamps(samples, now);
  if (window.length < 2) return 0;
  const span = window[window.length - 1] - window[0];
  if (span <= 0) return 0;
  return ((window.length - 1) * 1000) / span;
}

export const useAppStore = create<AppStore>((set) => ({
  shaderStatus: "clean",
  lastRender: null,
  shaderDiagnostics: [],
  lastShaderError: null,
  isPlaying: false,
  playDirection: 1,
  loopPlayback: readStoredFlag(LOOP_PLAYBACK_KEY, false),
  renderCanvas: null,
  previewWidth: 0,
  previewHeight: 0,
  renderQuality: 1.0,
  showFps: readStoredFlag(SHOW_FPS_KEY, false),
  showFrustumOverlay: readStoredFlag(SHOW_FRUSTUM_KEY, false),
  autoRender: readStoredFlag(AUTO_RENDER_KEY, true),
  renderRequested: false,
  pixelInspector: readStoredFlag(PIXEL_INSPECTOR_KEY, false),
  pixelInfo: null,
  mouse: [0, 0, 0, 0],
  inspectorFontSize: clampFont(readStoredNumber(INSPECTOR_FONT_KEY, INSPECTOR_FONT_DEFAULT)),
  gizmoEnabled: false,
  editorFontSize: clampFont(readStoredNumber(EDITOR_FONT_KEY, EDITOR_FONT_DEFAULT)),
  renderTimestamps: [],
  setShaderStatus: (s) => set({ shaderStatus: s }),
  setLastRender: (r) => set({ lastRender: r }),
  setShaderError: (e) => set({ lastShaderError: e }),
  setShaderDiagnostics: (d) => set({ shaderDiagnostics: d }),
  play: (direction = 1) => set({ isPlaying: true, playDirection: direction }),
  pause: () => set({ isPlaying: false }),
  togglePlay: (direction) =>
    set((s) => {
      // Pressing the same direction toggles off; pressing the opposite
      // direction flips and keeps playing. Calling without a direction
      // toggles isPlaying without changing direction.
      if (direction === undefined) {
        return { isPlaying: !s.isPlaying };
      }
      if (s.isPlaying && s.playDirection === direction) {
        return { isPlaying: false };
      }
      return { isPlaying: true, playDirection: direction };
    }),
  setLoopPlayback: (on) => {
    writeStoredFlag(LOOP_PLAYBACK_KEY, on);
    set({ loopPlayback: on });
  },
  toggleLoopPlayback: () =>
    set((s) => {
      const next = !s.loopPlayback;
      writeStoredFlag(LOOP_PLAYBACK_KEY, next);
      return { loopPlayback: next };
    }),
  setRenderCanvas: (c) => set({ renderCanvas: c }),
  setPreviewSize: (w, h) => set({ previewWidth: w, previewHeight: h }),
  setRenderQuality: (q) => set({ renderQuality: Math.min(2.0, Math.max(0.25, q)) }),
  setShowFps: (show) => {
    writeStoredFlag(SHOW_FPS_KEY, show);
    set({ showFps: show });
  },
  toggleFps: () =>
    set((s) => {
      const next = !s.showFps;
      writeStoredFlag(SHOW_FPS_KEY, next);
      return { showFps: next };
    }),
  setShowFrustumOverlay: (show) => {
    writeStoredFlag(SHOW_FRUSTUM_KEY, show);
    set({ showFrustumOverlay: show });
  },
  toggleFrustumOverlay: () =>
    set((s) => {
      const next = !s.showFrustumOverlay;
      writeStoredFlag(SHOW_FRUSTUM_KEY, next);
      return { showFrustumOverlay: next };
    }),
  setGizmoEnabled: (on) => set({ gizmoEnabled: on }),
  toggleGizmo: () => set((s) => ({ gizmoEnabled: !s.gizmoEnabled })),
  setAutoRender: (on) => {
    writeStoredFlag(AUTO_RENDER_KEY, on);
    set({ autoRender: on });
  },
  toggleAutoRender: () =>
    set((s) => {
      const next = !s.autoRender;
      writeStoredFlag(AUTO_RENDER_KEY, next);
      return { autoRender: next };
    }),
  requestRender: () => set({ renderRequested: true }),
  clearRenderRequest: () => set({ renderRequested: false }),
  setPixelInspector: (on) => {
    writeStoredFlag(PIXEL_INSPECTOR_KEY, on);
    set({ pixelInspector: on });
  },
  togglePixelInspector: () =>
    set((s) => {
      const next = !s.pixelInspector;
      writeStoredFlag(PIXEL_INSPECTOR_KEY, next);
      return { pixelInspector: next };
    }),
  setPixelInfo: (info) => set({ pixelInfo: info }),
  setMouse: (m) => set({ mouse: m }),
  setInspectorFontSize: (size) =>
    set(() => {
      const next = clampFont(size);
      writeStoredNumber(INSPECTOR_FONT_KEY, next);
      return { inspectorFontSize: next };
    }),
  increaseInspectorFontSize: () =>
    set((s) => {
      const next = clampFont(s.inspectorFontSize + 1);
      writeStoredNumber(INSPECTOR_FONT_KEY, next);
      return { inspectorFontSize: next };
    }),
  decreaseInspectorFontSize: () =>
    set((s) => {
      const next = clampFont(s.inspectorFontSize - 1);
      writeStoredNumber(INSPECTOR_FONT_KEY, next);
      return { inspectorFontSize: next };
    }),
  resetInspectorFontSize: () =>
    set(() => {
      writeStoredNumber(INSPECTOR_FONT_KEY, INSPECTOR_FONT_DEFAULT);
      return { inspectorFontSize: INSPECTOR_FONT_DEFAULT };
    }),
  setEditorFontSize: (size) =>
    set(() => {
      const next = clampFont(size);
      writeStoredNumber(EDITOR_FONT_KEY, next);
      return { editorFontSize: next };
    }),
  increaseEditorFontSize: () =>
    set((s) => {
      const next = clampFont(s.editorFontSize + 1);
      writeStoredNumber(EDITOR_FONT_KEY, next);
      return { editorFontSize: next };
    }),
  decreaseEditorFontSize: () =>
    set((s) => {
      const next = clampFont(s.editorFontSize - 1);
      writeStoredNumber(EDITOR_FONT_KEY, next);
      return { editorFontSize: next };
    }),
  resetEditorFontSize: () =>
    set(() => {
      writeStoredNumber(EDITOR_FONT_KEY, EDITOR_FONT_DEFAULT);
      return { editorFontSize: EDITOR_FONT_DEFAULT };
    }),
  recordRenderCompleted: (now) =>
    set((s) => {
      const t = now ?? performance.now();
      const next = trimTimestamps([...s.renderTimestamps, t], t);
      return { renderTimestamps: next };
    }),
}));
