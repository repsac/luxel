import { create } from "zustand";
import type { ConsoleEvent } from "./consoleStore";
import type { ViewId } from "./sceneStore";

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
  /// A manually pinned pixel in bottom-left / gl_FragCoord space, used for
  /// teaching: the Inspector shows it even when interactive Inspect is off,
  /// and the render view marks it with a crosshair. Preserved across canvas
  /// resizes; only its derived display reacts when it falls out of bounds.
  pinnedPixel: { x: number; y: number } | null;
  /// Whether to draw the crosshair marker over the pinned pixel.
  showCrosshair: boolean;
  /// Per-view text size in CSS pixels, keyed by view. Only views in
  /// FONT_DEFAULTS are scalable; a missing entry means "use the default".
  /// Persisted as one map so it survives restarts.
  viewFontSizes: Partial<Record<ViewId, number>>;
  /// The view the pointer is currently over. The font hotkey targets this
  /// view so one shortcut scales whichever panel you're looking at. Not
  /// cleared on leave, so it stays forgiving when the cursor drifts away.
  hoveredView: ViewId | null;
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
  setPinnedPixel: (p: { x: number; y: number } | null) => void;
  setShowCrosshair: (on: boolean) => void;
  toggleCrosshair: () => void;
  setHoveredView: (view: ViewId | null) => void;
  setViewFontSize: (view: ViewId, size: number) => void;
  adjustViewFontSize: (view: ViewId, delta: number) => void;
  resetViewFontSize: (view: ViewId) => void;
  recordRenderCompleted: (now?: number) => void;
}

const AUTO_RENDER_KEY = "luxel.autoRender";
const LOOP_PLAYBACK_KEY = "luxel.loopPlayback";
const SHOW_FPS_KEY = "luxel.showFps";
const SHOW_FRUSTUM_KEY = "luxel.showFrustumOverlay";

// ---- Font sizing ----
export const FONT_MIN = 8;
export const FONT_MAX = 32;
const FONT_FALLBACK = 13;

/// Views whose text can be scaled, with their default size in CSS px. A view
/// absent from this map is not font-scalable (e.g. the render view).
export const FONT_DEFAULTS: Partial<Record<ViewId, number>> = {
  editor: 13,
  inspector: 14,
  console: 12,
  scratchpad: 13,
};

const VIEW_FONT_KEY = "luxel.viewFontSizes";
// Legacy single-view keys, migrated into the map on first load.
const LEGACY_FONT_KEYS: Partial<Record<ViewId, string>> = {
  editor: "luxel.editorFontSize",
  inspector: "luxel.inspectorFontSize",
};

/// Resolve a view's effective font size: its stored value, else the view's
/// default, else a generic fallback.
export function fontSizeForView(
  sizes: Partial<Record<ViewId, number>>,
  view: ViewId,
): number {
  return sizes[view] ?? FONT_DEFAULTS[view] ?? FONT_FALLBACK;
}

/// Whether the font hotkey can act on this view.
export function isFontScalable(view: ViewId | null): view is ViewId {
  return view != null && view in FONT_DEFAULTS;
}

function clampFont(size: number): number {
  if (!Number.isFinite(size)) return FONT_FALLBACK;
  return Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(size)));
}

/// Load the per-view font map, migrating any legacy single-view keys that
/// haven't been folded in yet.
function readViewFontSizes(): Partial<Record<ViewId, number>> {
  const out: Partial<Record<ViewId, number>> = {};
  try {
    const raw = localStorage.getItem(VIEW_FONT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "number" && Number.isFinite(v)) {
            out[k as ViewId] = clampFont(v);
          }
        }
      }
    }
  } catch {
    // Corrupt/unavailable storage — fall back to defaults.
  }
  for (const [view, legacyKey] of Object.entries(LEGACY_FONT_KEYS)) {
    const v = view as ViewId;
    if (out[v] !== undefined || !legacyKey) continue;
    try {
      const raw = localStorage.getItem(legacyKey);
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) out[v] = clampFont(n);
      }
    } catch {
      // ignore
    }
  }
  return out;
}

function writeViewFontSizes(sizes: Partial<Record<ViewId, number>>): void {
  try {
    localStorage.setItem(VIEW_FONT_KEY, JSON.stringify(sizes));
  } catch {
    // Private/locked storage — silently ignore.
  }
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
  // Inspect and the crosshair are teaching aids that start off every launch
  // (session-only, not persisted) so the viewport is clean by default.
  pixelInspector: false,
  pixelInfo: null,
  mouse: [0, 0, 0, 0],
  pinnedPixel: null,
  showCrosshair: false,
  viewFontSizes: readViewFontSizes(),
  hoveredView: null,
  gizmoEnabled: false,
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
  setPixelInspector: (on) => set({ pixelInspector: on }),
  togglePixelInspector: () => set((s) => ({ pixelInspector: !s.pixelInspector })),
  setPixelInfo: (info) => set({ pixelInfo: info }),
  setMouse: (m) => set({ mouse: m }),
  setPinnedPixel: (p) => set({ pinnedPixel: p }),
  setShowCrosshair: (on) => set({ showCrosshair: on }),
  toggleCrosshair: () => set((s) => ({ showCrosshair: !s.showCrosshair })),
  setHoveredView: (view) => set({ hoveredView: view }),
  setViewFontSize: (view, size) =>
    set((s) => {
      const next = { ...s.viewFontSizes, [view]: clampFont(size) };
      writeViewFontSizes(next);
      return { viewFontSizes: next };
    }),
  adjustViewFontSize: (view, delta) =>
    set((s) => {
      const current = fontSizeForView(s.viewFontSizes, view);
      const next = { ...s.viewFontSizes, [view]: clampFont(current + delta) };
      writeViewFontSizes(next);
      return { viewFontSizes: next };
    }),
  resetViewFontSize: (view) =>
    set((s) => {
      // Drop the override so the view falls back to its default.
      const next = { ...s.viewFontSizes };
      delete next[view];
      writeViewFontSizes(next);
      return { viewFontSizes: next };
    }),
  recordRenderCompleted: (now) =>
    set((s) => {
      const t = now ?? performance.now();
      const next = trimTimestamps([...s.renderTimestamps, t], t);
      return { renderTimestamps: next };
    }),
}));
