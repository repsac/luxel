import { describe, it, expect } from "vitest";
import { decodeRenderPayload, RENDER_HEADER_BYTES } from "./render";

/// Helper that builds the same little-endian header the Tauri command emits.
function makePayload(
  width: number,
  height: number,
  totalMs: number,
  gpuMs: number,
  pixels: Uint8Array,
): ArrayBuffer {
  const buf = new ArrayBuffer(RENDER_HEADER_BYTES + pixels.byteLength);
  const view = new DataView(buf);
  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  view.setUint32(8, totalMs, true);
  view.setUint32(12, gpuMs, true);
  new Uint8Array(buf, RENDER_HEADER_BYTES).set(pixels);
  return buf;
}

describe("decodeRenderPayload", () => {
  it("reads width, height, and timing from the 16-byte header", () => {
    const pixels = new Uint8Array(2 * 3 * 4).fill(0); // 2x3 RGBA
    pixels[0] = 255;
    pixels[1] = 128;
    pixels[2] = 64;
    pixels[3] = 255;
    const buf = makePayload(2, 3, 17, 9, pixels);

    const d = decodeRenderPayload(buf);
    expect(d.width).toBe(2);
    expect(d.height).toBe(3);
    expect(d.totalMs).toBe(17);
    expect(d.gpuMs).toBe(9);
    expect(d.pixels.length).toBe(2 * 3 * 4);
    expect(Array.from(d.pixels.slice(0, 4))).toEqual([255, 128, 64, 255]);
  });

  it("does not copy the pixel data — the typed array views the original buffer", () => {
    const pixels = new Uint8Array(4 * 4).fill(7);
    const buf = makePayload(2, 2, 0, 0, pixels);
    const d = decodeRenderPayload(buf);
    // Mutating the original buffer must show through, which proves we didn't
    // allocate a copy on the hot path.
    new Uint8Array(buf, RENDER_HEADER_BYTES)[0] = 200;
    expect(d.pixels[0]).toBe(200);
  });

  it("throws when the payload is shorter than the header", () => {
    const tiny = new ArrayBuffer(RENDER_HEADER_BYTES - 1);
    expect(() => decodeRenderPayload(tiny)).toThrow(/too small/);
  });

  it("throws when pixel byte count doesn't match width*height*4", () => {
    // Header claims 4x4 RGBA (= 64 bytes) but only 60 bytes follow.
    const wrong = new Uint8Array(60);
    const buf = makePayload(4, 4, 0, 0, wrong);
    expect(() => decodeRenderPayload(buf)).toThrow(/pixel size mismatch/);
  });
});
