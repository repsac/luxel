import { beforeEach, describe, it, expect } from "vitest";
import {
  computeFps,
  FONT_DEFAULTS,
  FONT_MAX,
  FONT_MIN,
  fontSizeForView,
  isFontScalable,
  useAppStore,
} from "./appStore";

const sizeOf = (view: "editor" | "inspector" | "console") =>
  fontSizeForView(useAppStore.getState().viewFontSizes, view);

describe("per-view font-size actions", () => {
  beforeEach(() => {
    useAppStore.getState().resetViewFontSize("editor");
    useAppStore.getState().resetViewFontSize("inspector");
    useAppStore.getState().resetViewFontSize("console");
  });

  it("each view starts at its own default size", () => {
    expect(sizeOf("editor")).toBe(FONT_DEFAULTS.editor);
    expect(sizeOf("inspector")).toBe(FONT_DEFAULTS.inspector);
    expect(sizeOf("console")).toBe(FONT_DEFAULTS.console);
  });

  it("adjust steps by the delta and caps at FONT_MAX", () => {
    const start = sizeOf("editor");
    useAppStore.getState().adjustViewFontSize("editor", 1);
    expect(sizeOf("editor")).toBe(start + 1);
    for (let i = 0; i < 100; i++) useAppStore.getState().adjustViewFontSize("editor", 1);
    expect(sizeOf("editor")).toBe(FONT_MAX);
  });

  it("adjust floors at FONT_MIN", () => {
    for (let i = 0; i < 100; i++) useAppStore.getState().adjustViewFontSize("editor", -1);
    expect(sizeOf("editor")).toBe(FONT_MIN);
  });

  it("reset returns a view to its default after zooming", () => {
    useAppStore.getState().adjustViewFontSize("inspector", 3);
    useAppStore.getState().resetViewFontSize("inspector");
    expect(sizeOf("inspector")).toBe(FONT_DEFAULTS.inspector);
  });

  it("views are scaled independently", () => {
    useAppStore.getState().adjustViewFontSize("editor", 2);
    expect(sizeOf("editor")).toBe((FONT_DEFAULTS.editor ?? 0) + 2);
    expect(sizeOf("inspector")).toBe(FONT_DEFAULTS.inspector);
    expect(sizeOf("console")).toBe(FONT_DEFAULTS.console);
  });

  it("setViewFontSize clamps non-finite input and rounds fractional input", () => {
    useAppStore.getState().setViewFontSize("editor", Number.NaN);
    expect(sizeOf("editor")).toBe(13); // generic fallback for NaN
    useAppStore.getState().setViewFontSize("editor", 15.4);
    expect(sizeOf("editor")).toBe(15);
    useAppStore.getState().setViewFontSize("editor", FONT_MAX + 50);
    expect(sizeOf("editor")).toBe(FONT_MAX);
    useAppStore.getState().setViewFontSize("editor", FONT_MIN - 50);
    expect(sizeOf("editor")).toBe(FONT_MIN);
  });
});

describe("font scalability + hovered view", () => {
  it("only views in FONT_DEFAULTS are scalable", () => {
    expect(isFontScalable("editor")).toBe(true);
    expect(isFontScalable("inspector")).toBe(true);
    expect(isFontScalable("console")).toBe(true);
    expect(isFontScalable("render")).toBe(false);
    expect(isFontScalable("empty")).toBe(false);
    expect(isFontScalable(null)).toBe(false);
  });

  it("tracks the hovered view", () => {
    useAppStore.getState().setHoveredView("console");
    expect(useAppStore.getState().hoveredView).toBe("console");
    useAppStore.getState().setHoveredView(null);
    expect(useAppStore.getState().hoveredView).toBeNull();
  });
});

describe("frustum overlay preference", () => {
  beforeEach(() => {
    // Force the toggle off so each test starts from a known state. The
    // backing localStorage may or may not be a full implementation under
    // vitest 4's jsdom environment, so guard `removeItem` defensively.
    try {
      if (typeof localStorage?.removeItem === "function") {
        localStorage.removeItem("luxel.showFrustumOverlay");
      }
    } catch {
      /* ignore */
    }
    useAppStore.getState().setShowFrustumOverlay(false);
  });

  it("toggleFrustumOverlay flips the boolean", () => {
    expect(useAppStore.getState().showFrustumOverlay).toBe(false);
    useAppStore.getState().toggleFrustumOverlay();
    expect(useAppStore.getState().showFrustumOverlay).toBe(true);
    useAppStore.getState().toggleFrustumOverlay();
    expect(useAppStore.getState().showFrustumOverlay).toBe(false);
  });

  it("setShowFrustumOverlay accepts explicit values", () => {
    useAppStore.getState().setShowFrustumOverlay(true);
    expect(useAppStore.getState().showFrustumOverlay).toBe(true);
    useAppStore.getState().setShowFrustumOverlay(false);
    expect(useAppStore.getState().showFrustumOverlay).toBe(false);
  });

  it("persists the toggle to localStorage when storage is available", () => {
    // vitest 4's default jsdom environment stubs `localStorage` differently
    // depending on options, so guard the assertion. The appStore code
    // already silently no-ops on `localStorage` failure, which is the
    // contract we actually care about — this assertion is the bonus check
    // for the happy path.
    const hasLs =
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function" &&
      typeof localStorage.setItem === "function";
    if (!hasLs) return;
    useAppStore.getState().setShowFrustumOverlay(true);
    expect(localStorage.getItem("luxel.showFrustumOverlay")).toBe("true");
    useAppStore.getState().setShowFrustumOverlay(false);
    expect(localStorage.getItem("luxel.showFrustumOverlay")).toBe("false");
  });
});

describe("computeFps", () => {
  it("returns 0 when there is no history", () => {
    expect(computeFps([], 1000)).toBe(0);
  });

  it("returns 0 from a single sample", () => {
    expect(computeFps([500], 1000)).toBe(0);
  });

  it("reports steady 60fps from evenly spaced timestamps", () => {
    const samples = Array.from({ length: 30 }, (_, i) => i * (1000 / 60));
    const fps = computeFps(samples, samples[samples.length - 1]);
    expect(fps).toBeCloseTo(60, 1);
  });

  it("ignores samples older than the 2s window", () => {
    // One ancient sample, then 10 recent samples at ~30fps.
    const recent = Array.from({ length: 10 }, (_, i) => 5_000 + i * (1000 / 30));
    const samples = [100, ...recent];
    const now = recent[recent.length - 1];
    const fps = computeFps(samples, now);
    expect(fps).toBeCloseTo(30, 0);
  });

  it("returns 0 when all samples fall outside the window", () => {
    const samples = [10, 20, 30];
    expect(computeFps(samples, 10_000)).toBe(0);
  });
});
