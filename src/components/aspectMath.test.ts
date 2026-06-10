import { describe, expect, it } from "vitest";
import { fitOverlay, parseAspect } from "./aspectMath";

describe("aspectMath", () => {
  it("parses common ratios", () => {
    expect(parseAspect("16:9")).toEqual({ num: 16, den: 9 });
    expect(parseAspect("4:3")).toEqual({ num: 4, den: 3 });
    expect(parseAspect("1:1")).toEqual({ num: 1, den: 1 });
    expect(parseAspect(" 21 : 9 ")).toEqual({ num: 21, den: 9 });
  });

  it("rejects invalid ratios", () => {
    expect(parseAspect("16x9")).toBeNull();
    expect(parseAspect("0:9")).toBeNull();
    expect(parseAspect("9:0")).toBeNull();
    expect(parseAspect("abc")).toBeNull();
  });

  it("fits centered rectangle preserving ratio", () => {
    const r = fitOverlay(1920, 1080, { num: 16, den: 9 });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(0);
    expect(r.width).toBeCloseTo(1920);
    expect(r.height).toBeCloseTo(1080);
  });

  it("letterboxes when viewport is wider", () => {
    const r = fitOverlay(2000, 1000, { num: 16, den: 9 });
    expect(r.height).toBeCloseTo(1000);
    expect(r.width).toBeCloseTo((1000 * 16) / 9);
    expect(r.x).toBeGreaterThan(0);
  });
});
