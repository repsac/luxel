import { describe, expect, it } from "vitest";
import type { LastRender } from "../state/appStore";
import { pixelInfoAt, pixelInBounds } from "./pixelMath";

/// Build a 3x2 render where each pixel's red channel encodes its top-row index
/// so tests can assert the row-flip is correct. Layout (top-to-bottom):
///   row 0 (top):    (0,0,0) (10,0,0) (20,0,0)
///   row 1 (bottom): (30,1,1) (40,1,1) (50,1,1)
function makeRender(): LastRender {
  const width = 3;
  const height = 2;
  const px = new Uint8ClampedArray(width * height * 4);
  const set = (i: number, r: number, g: number, b: number) => {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  };
  set(0, 0, 0, 0);
  set(1, 10, 0, 0);
  set(2, 20, 0, 0);
  set(3, 30, 1, 1);
  set(4, 40, 1, 1);
  set(5, 50, 1, 1);
  return {
    totalMs: 0,
    width,
    height,
    pixels: px as Uint8ClampedArray<ArrayBuffer>,
  };
}

describe("pixelInfoAt", () => {
  it("maps bottom-left origin to the flipped row (y=0 is the bottom row)", () => {
    const r = makeRender();
    // Bottom-left pixel (0,0) is the start of the stored bottom row.
    const bl = pixelInfoAt(r, 0, 0);
    expect(bl).not.toBeNull();
    expect(bl!.r).toBe(30);
    // Top-left pixel (0, height-1) is the stored top row.
    const tl = pixelInfoAt(r, 0, 1);
    expect(tl!.r).toBe(0);
  });

  it("reports coordinates, resolution, and UV at pixel centers", () => {
    const r = makeRender();
    const info = pixelInfoAt(r, 2, 1)!;
    expect(info.px).toBe(2);
    expect(info.py).toBe(1);
    expect(info.resX).toBe(3);
    expect(info.resY).toBe(2);
    expect(info.u).toBeCloseTo((2 + 0.5) / 3, 6);
    expect(info.v).toBeCloseTo((1 + 0.5) / 2, 6);
    expect(info.r).toBe(20); // top-right pixel
  });

  it("floors fractional coordinates", () => {
    const r = makeRender();
    expect(pixelInfoAt(r, 1.9, 0.4)!.px).toBe(1);
    expect(pixelInfoAt(r, 1.9, 0.4)!.py).toBe(0);
  });

  it("returns null outside the render in every direction", () => {
    const r = makeRender();
    expect(pixelInfoAt(r, -1, 0)).toBeNull();
    expect(pixelInfoAt(r, 0, -1)).toBeNull();
    expect(pixelInfoAt(r, 3, 0)).toBeNull(); // width is 3, so x=3 is out
    expect(pixelInfoAt(r, 0, 2)).toBeNull(); // height is 2, so y=2 is out
  });
});

describe("pixelInBounds", () => {
  it("matches the corners of the render", () => {
    const r = makeRender();
    expect(pixelInBounds(r, 0, 0)).toBe(true);
    expect(pixelInBounds(r, 2, 1)).toBe(true);
    expect(pixelInBounds(r, 3, 1)).toBe(false);
    expect(pixelInBounds(r, 2, 2)).toBe(false);
  });
});
