import { describe, it, expect } from "vitest";
import { computeFps } from "./appStore";

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
