import { describe, expect, it } from "vitest";
import {
  cameraBasis,
  computeGizmo,
  distanceToSegment,
  dragDelta,
  pickAxis,
  projectToScreen,
  type CameraLike,
} from "./gizmoMath";

// Default Luxel camera: at (0,0,5) looking down -Z, up +Y, 45° vertical FOV.
const CAM: CameraLike = {
  position: [0, 0, 5],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fovYDegrees: 45,
};

describe("cameraBasis", () => {
  it("derives forward/-Z, right/+X, up/+Y for the default camera", () => {
    const b = cameraBasis(CAM);
    expect(b.forward[2]).toBeCloseTo(-1);
    expect(b.right[0]).toBeCloseTo(1);
    expect(b.up[1]).toBeCloseTo(1);
  });
});

describe("projectToScreen", () => {
  const basis = cameraBasis(CAM);

  it("maps the look-at target to the viewport center", () => {
    const p = projectToScreen([0, 0, 0], CAM, basis, 800, 600);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(300);
    expect(p.visible).toBe(true);
  });

  it("places a point above the target higher on screen (smaller y)", () => {
    const p = projectToScreen([0, 1, 0], CAM, basis, 800, 600);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeLessThan(300);
  });

  it("places a point to the camera's right at larger x", () => {
    const p = projectToScreen([1, 0, 0], CAM, basis, 800, 600);
    expect(p.x).toBeGreaterThan(400);
    expect(p.y).toBeCloseTo(300);
  });

  it("flags points behind the camera as not visible", () => {
    const p = projectToScreen([0, 0, 10], CAM, basis, 800, 600);
    expect(p.visible).toBe(false);
  });
});

describe("computeGizmo", () => {
  it("origin sits at the projected object position", () => {
    const g = computeGizmo([0, 0, 0], CAM, 800, 600, 60);
    expect(g.origin.x).toBeCloseTo(400);
    expect(g.origin.y).toBeCloseTo(300);
    expect(g.axes).toHaveLength(3);
  });

  it("X axis handle points right, Y axis handle points up", () => {
    const g = computeGizmo([0, 0, 0], CAM, 800, 600, 60);
    const [x, y] = g.axes;
    // X handle tip should be to the right of origin
    expect(x.tipX).toBeGreaterThan(g.origin.x);
    // Y handle tip should be above origin (smaller screen y)
    expect(y.tipY).toBeLessThan(g.origin.y);
  });

  it("handle length is approximately handlePx", () => {
    const handlePx = 60;
    const g = computeGizmo([0, 0, 0], CAM, 800, 600, handlePx);
    for (const a of g.axes) {
      // Z axis points almost straight at the camera so its projected handle
      // may be near-zero length; skip degenerate cases.
      const l = Math.hypot(a.tipX - g.origin.x, a.tipY - g.origin.y);
      if (a.dirX === 0 && a.dirY === 0) continue;
      expect(l).toBeCloseTo(handlePx, 0);
    }
  });

  it("worldPerPixel is positive for axes that project to a screen direction", () => {
    const g = computeGizmo([0, 0, 0], CAM, 800, 600, 60);
    // X and Y axes are perpendicular to the view direction, so they project
    // to real screen movement.
    expect(g.axes[0].worldPerPixel).toBeGreaterThan(0);
    expect(g.axes[1].worldPerPixel).toBeGreaterThan(0);
  });
});

describe("distanceToSegment", () => {
  it("0 when the point lies on the segment", () => {
    expect(distanceToSegment(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });
  it("perpendicular distance for a point beside the segment", () => {
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });
  it("endpoint distance when the projection falls outside the segment", () => {
    expect(distanceToSegment(-4, 0, 0, 0, 10, 0)).toBeCloseTo(4);
    expect(distanceToSegment(14, 0, 0, 0, 10, 0)).toBeCloseTo(4);
  });
});

describe("pickAxis", () => {
  it("picks the axis whose handle is nearest the cursor within threshold", () => {
    const g = computeGizmo([0, 0, 0], CAM, 800, 600, 60);
    // A point right on the X handle tip should pick axis 0.
    const x = g.axes[0];
    expect(pickAxis(g, x.tipX, x.tipY, 10)).toBe(0);
  });

  it("returns -1 when nothing is within threshold", () => {
    const g = computeGizmo([0, 0, 0], CAM, 800, 600, 60);
    expect(pickAxis(g, 5, 5, 4)).toBe(-1);
  });
});

describe("dragDelta", () => {
  it("moving the cursor along the X handle direction translates +X", () => {
    const g = computeGizmo([0, 0, 0], CAM, 800, 600, 60);
    const xAxis = g.axes[0];
    // Drag 50px in the screen direction of the X handle.
    const delta = dragDelta(xAxis, xAxis.dirX * 50, xAxis.dirY * 50);
    expect(delta[0]).toBeGreaterThan(0);
    expect(delta[1]).toBeCloseTo(0);
    expect(delta[2]).toBeCloseTo(0);
  });

  it("dragging opposite the handle direction translates negative", () => {
    const g = computeGizmo([0, 0, 0], CAM, 800, 600, 60);
    const xAxis = g.axes[0];
    const delta = dragDelta(xAxis, -xAxis.dirX * 50, -xAxis.dirY * 50);
    expect(delta[0]).toBeLessThan(0);
  });
});
