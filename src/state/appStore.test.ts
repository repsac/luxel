import { beforeEach, describe, it, expect } from "vitest";
import {
  computeFps,
  EDITOR_FONT_DEFAULT,
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  useAppStore,
} from "./appStore";

describe("editor font-size actions", () => {
  beforeEach(() => {
    useAppStore.getState().resetEditorFontSize();
  });

  it("starts at the default size", () => {
    expect(useAppStore.getState().editorFontSize).toBe(EDITOR_FONT_DEFAULT);
  });

  it("increase steps up by 1 and caps at EDITOR_FONT_MAX", () => {
    const start = useAppStore.getState().editorFontSize;
    useAppStore.getState().increaseEditorFontSize();
    expect(useAppStore.getState().editorFontSize).toBe(start + 1);
    for (let i = 0; i < 100; i++) useAppStore.getState().increaseEditorFontSize();
    expect(useAppStore.getState().editorFontSize).toBe(EDITOR_FONT_MAX);
  });

  it("decrease steps down by 1 and floors at EDITOR_FONT_MIN", () => {
    for (let i = 0; i < 100; i++) useAppStore.getState().decreaseEditorFontSize();
    expect(useAppStore.getState().editorFontSize).toBe(EDITOR_FONT_MIN);
  });

  it("reset returns to the default after zooming", () => {
    useAppStore.getState().increaseEditorFontSize();
    useAppStore.getState().increaseEditorFontSize();
    useAppStore.getState().resetEditorFontSize();
    expect(useAppStore.getState().editorFontSize).toBe(EDITOR_FONT_DEFAULT);
  });

  it("setEditorFontSize clamps non-finite input to the default", () => {
    useAppStore.getState().setEditorFontSize(Number.NaN);
    expect(useAppStore.getState().editorFontSize).toBe(EDITOR_FONT_DEFAULT);
  });

  it("setEditorFontSize rounds fractional input and clamps to the legal range", () => {
    useAppStore.getState().setEditorFontSize(15.4);
    expect(useAppStore.getState().editorFontSize).toBe(15);
    useAppStore.getState().setEditorFontSize(EDITOR_FONT_MAX + 50);
    expect(useAppStore.getState().editorFontSize).toBe(EDITOR_FONT_MAX);
    useAppStore.getState().setEditorFontSize(EDITOR_FONT_MIN - 50);
    expect(useAppStore.getState().editorFontSize).toBe(EDITOR_FONT_MIN);
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
