import { describe, expect, it } from "vitest";
import { frameToSeconds, secondsToFrame } from "./playbackMath";

describe("secondsToFrame", () => {
  it("rounds to the nearest integer frame", () => {
    expect(secondsToFrame(2.5, 60)).toBe(150);
    expect(secondsToFrame(2.504, 60)).toBe(150);
    expect(secondsToFrame(2.51, 60)).toBe(151);
  });

  it("returns 0 for non-positive FPS to avoid NaN/Infinity leaking into the timeline", () => {
    expect(secondsToFrame(2.5, 0)).toBe(0);
    expect(secondsToFrame(2.5, -10)).toBe(0);
  });

  it("returns 0 for non-finite seconds", () => {
    expect(secondsToFrame(Number.NaN, 60)).toBe(0);
    expect(secondsToFrame(Number.POSITIVE_INFINITY, 60)).toBe(0);
  });

  it("round-trips with frameToSeconds for integer seconds at integer FPS", () => {
    for (const fps of [24, 30, 60, 120]) {
      for (const f of [0, 1, 30, 120, 999]) {
        const back = secondsToFrame(frameToSeconds(f, fps), fps);
        expect(back).toBe(f);
      }
    }
  });
});

describe("frameToSeconds", () => {
  it("divides frame by fps", () => {
    expect(frameToSeconds(150, 60)).toBeCloseTo(2.5);
    expect(frameToSeconds(0, 60)).toBe(0);
    expect(frameToSeconds(60, 30)).toBeCloseTo(2.0);
  });

  it("returns 0 for non-usable FPS", () => {
    expect(frameToSeconds(150, 0)).toBe(0);
    expect(frameToSeconds(150, -1)).toBe(0);
    expect(frameToSeconds(150, Number.NaN)).toBe(0);
  });

  it("returns 0 for non-finite frame", () => {
    expect(frameToSeconds(Number.NaN, 60)).toBe(0);
  });
});
