import type { LastRender, PixelInfo } from "../state/appStore";

/// Compute pixel info at a render-space coordinate expressed in bottom-left
/// origin (the same convention as gl_FragCoord and the inspector readout).
///
/// `render.pixels` is stored row-major top-to-bottom, so we flip the row to
/// index it. Returns null when the coordinate is outside the current render,
/// which is how out-of-bounds (e.g. a pinned pixel after the canvas shrank)
/// is signalled to callers.
export function pixelInfoAt(
  render: LastRender,
  x: number,
  y: number,
): PixelInfo | null {
  const { width, height, pixels } = render;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= width || iy < 0 || iy >= height) return null;
  const rowTop = height - 1 - iy;
  const idx = (rowTop * width + ix) * 4;
  if (idx < 0 || idx + 2 >= pixels.length) return null;
  return {
    px: ix,
    py: iy,
    resX: width,
    resY: height,
    u: (ix + 0.5) / width,
    v: (iy + 0.5) / height,
    r: pixels[idx],
    g: pixels[idx + 1],
    b: pixels[idx + 2],
  };
}

/// Whether a bottom-left pixel coordinate is inside the given render.
export function pixelInBounds(
  render: LastRender,
  x: number,
  y: number,
): boolean {
  return (
    Math.floor(x) >= 0 &&
    Math.floor(x) < render.width &&
    Math.floor(y) >= 0 &&
    Math.floor(y) < render.height
  );
}
