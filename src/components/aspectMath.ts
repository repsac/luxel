export interface Aspect {
  num: number;
  den: number;
}

export function parseAspect(s: string): Aspect | null {
  const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(s);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const den = parseInt(m[2], 10);
  if (num <= 0 || den <= 0) return null;
  return { num, den };
}

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fitOverlay(
  viewportW: number,
  viewportH: number,
  aspect: Aspect,
): OverlayRect {
  const target = aspect.num / aspect.den;
  const viewportAspect = viewportW / viewportH;
  let w: number;
  let h: number;
  if (viewportAspect > target) {
    h = viewportH;
    w = h * target;
  } else {
    w = viewportW;
    h = w / target;
  }
  return { x: (viewportW - w) / 2, y: (viewportH - h) / 2, width: w, height: h };
}
