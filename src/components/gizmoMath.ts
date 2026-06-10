// Math for the move gizmo overlay. These functions invert the *exact* ray
// formula the shader prelude uses so the on-screen handles line up with what's
// rendered — rather than building a separate view/projection matrix that might
// drift from the raymarch convention.
//
// The shader computes ray directions as:
//   uv = (fragCoord * 2 - iResolution) / iResolution.y       // Shadertoy uv
//   rd = normalize(iCameraForward + uv.x*h*iCameraRight + uv.y*h*iCameraUp)
// with h = tan(fovY/2) and fragCoord origin at the BOTTOM-left. We invert that
// to project a world point to screen (top-left origin) pixels.

export type Vec3 = [number, number, number];

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function len(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
export function normalize(a: Vec3): Vec3 {
  const l = len(a);
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

export interface CameraLike {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fovYDegrees: number;
}

export interface CameraBasis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

/// Replicate the renderer's CameraBasis::from exactly (see renderer.rs) so the
/// gizmo and the rendered image agree on which way is right/up/forward.
export function cameraBasis(cam: CameraLike): CameraBasis {
  const forward = normalize(sub(cam.target, cam.position));
  let right = normalize(cross(forward, normalize(cam.up)));
  if (len(right) < 1e-5) right = [1, 0, 0];
  const up = cross(right, forward);
  return { forward, right, up };
}

export interface Projected {
  x: number;
  y: number;
  /// True when the point is in front of the camera (f > 0).
  visible: boolean;
}

/// Project a world-space point to screen pixels (top-left origin, y down) for a
/// viewport of `vw × vh`. Mirrors the shader's ray formula inverse.
export function projectToScreen(
  world: Vec3,
  cam: CameraLike,
  basis: CameraBasis,
  vw: number,
  vh: number,
): Projected {
  const dir = sub(world, cam.position);
  const f = dot(dir, basis.forward);
  const r = dot(dir, basis.right);
  const u = dot(dir, basis.up);
  const hh = Math.tan((cam.fovYDegrees * Math.PI) / 180 / 2);
  const visible = f > 1e-6;
  const ff = visible ? f : 1e-6;
  const uvx = r / (ff * hh);
  const uvy = u / (ff * hh);
  // uv → fragCoord (Shadertoy bottom-left origin)
  const fragX = (uvx * vh + vw) / 2;
  const fragY = (uvy * vh + vh) / 2;
  // fragCoord → screen (top-left origin)
  return { x: fragX, y: vh - fragY, visible };
}

export interface GizmoAxis {
  /// Unit world axis this handle moves along.
  axis: Vec3;
  /// Tip of the handle in screen pixels.
  tipX: number;
  tipY: number;
  /// Unit screen-space direction of the handle.
  dirX: number;
  dirY: number;
  /// World units per screen pixel along this axis at the object's depth.
  worldPerPixel: number;
}

export interface GizmoLayout {
  origin: Projected;
  axes: GizmoAxis[];
}

/// World step used to derive each axis's screen direction via finite
/// difference. Small enough that perspective curvature is negligible, large
/// enough to stay numerically stable.
const PROBE_EPS = 0.05;

/// Compute the on-screen gizmo geometry for an object at `objPos`. `handlePx`
/// is the desired handle length in pixels.
export function computeGizmo(
  objPos: Vec3,
  cam: CameraLike,
  vw: number,
  vh: number,
  handlePx: number,
): GizmoLayout {
  const basis = cameraBasis(cam);
  const origin = projectToScreen(objPos, cam, basis, vw, vh);
  const worldAxes: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const axes = worldAxes.map((axis): GizmoAxis => {
    const probe = projectToScreen(add(objPos, scale(axis, PROBE_EPS)), cam, basis, vw, vh);
    const dx = probe.x - origin.x;
    const dy = probe.y - origin.y;
    const l = Math.hypot(dx, dy);
    const dirX = l > 1e-6 ? dx / l : 0;
    const dirY = l > 1e-6 ? dy / l : 0;
    // PROBE_EPS world units mapped to `l` pixels → world-per-pixel = eps / l.
    const worldPerPixel = l > 1e-6 ? PROBE_EPS / l : 0;
    return {
      axis,
      tipX: origin.x + dirX * handlePx,
      tipY: origin.y + dirY * handlePx,
      dirX,
      dirY,
      worldPerPixel,
    };
  });
  return { origin, axes };
}

/// Shortest distance from point (px,py) to segment (ax,ay)-(bx,by).
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);
  const t = c1 / c2;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/// Given a gizmo layout, find which axis handle the cursor is closest to,
/// within `thresholdPx`. Returns the index (0=X,1=Y,2=Z) or -1.
export function pickAxis(
  layout: GizmoLayout,
  px: number,
  py: number,
  thresholdPx: number,
): number {
  let best = -1;
  let bestDist = thresholdPx;
  layout.axes.forEach((a, i) => {
    const d = distanceToSegment(px, py, layout.origin.x, layout.origin.y, a.tipX, a.tipY);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/// World-space translation along an axis for a pointer move of (dx,dy) px.
/// Returns the delta to add to the object position (already multiplied by the
/// world axis).
export function dragDelta(axisInfo: GizmoAxis, dx: number, dy: number): Vec3 {
  const along = dx * axisInfo.dirX + dy * axisInfo.dirY;
  const world = along * axisInfo.worldPerPixel;
  return scale(axisInfo.axis, world);
}
