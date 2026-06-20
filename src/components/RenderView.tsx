import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";
import { fitOverlay, parseAspect } from "./aspectMath";
import { pixelInfoAt } from "./pixelMath";
import { computeGizmo, dragDelta, pickAxis } from "./gizmoMath";
import { GIZMO_POC_ENABLED } from "../featureFlags";
import AspectRatioControl from "./AspectRatioControl";
import CameraBookmarks from "./CameraBookmarks";
import FpsOverlay from "./FpsOverlay";

type V3 = [number, number, number];

/// Move-gizmo constants.
const GIZMO_HANDLE_PX = 64; // axis handle length on screen
const GIZMO_HIT_PX = 9; // pointer pick tolerance from an axis line
const AXIS_COLORS = ["#ff5d5d", "#5dff86", "#5da8ff"]; // X, Y, Z

const DEFAULT_CAMERA = {
  position: [0, 0, 5] as V3,
  target: [0, 0, 0] as V3,
  up: [0, 1, 0] as V3,
  fovYDegrees: 45,
  near: 0.1,
  far: 1000,
};

/// Largest preview render the wgpu pipeline will accept in a single frame.
/// Above this, CSS scales the canvas up.
const MAX_PREVIEW_DIM = 2048;

export default function RenderView() {
  const file = useSceneStore((s) => s.file);
  const setCamera = useSceneStore((s) => s.setCamera);
  const setObjectPosition = useSceneStore((s) => s.setObjectPosition);
  const lastRender = useAppStore((s) => s.lastRender);
  const setRenderCanvas = useAppStore((s) => s.setRenderCanvas);
  const setPreviewSize = useAppStore((s) => s.setPreviewSize);
  // Frustum overlay flag is a global UI preference (localStorage-backed),
  // not part of the scene — see AspectRatioControl for the toggle.
  const showFrustum = useAppStore((s) => s.showFrustumOverlay);
  const gizmoEnabled = useAppStore((s) => s.gizmoEnabled);
  const toggleGizmo = useAppStore((s) => s.toggleGizmo);
  const pixelInspector = useAppStore((s) => s.pixelInspector);
  const togglePixelInspector = useAppStore((s) => s.togglePixelInspector);
  const pixelInfo = useAppStore((s) => s.pixelInfo);
  const setPixelInfo = useAppStore((s) => s.setPixelInfo);
  const setMouse = useAppStore((s) => s.setMouse);
  const pinnedPixel = useAppStore((s) => s.pinnedPixel);
  const showCrosshair = useAppStore((s) => s.showCrosshair);
  const toggleCrosshair = useAppStore((s) => s.toggleCrosshair);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapPx, setWrapPx] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; button: number; shift: boolean } | null>(
    null,
  );
  // Active gizmo drag: which axis (0=X,1=Y,2=Z) and the last client position.
  const gizmoDragRef = useRef<{ axis: number; x: number; y: number } | null>(null);
  const [activeAxis, setActiveAxis] = useState<number | null>(null);

  // Track the wrap div's pixel dimensions and feed them into appStore. The
  // auto-render hook then picks up the change and re-renders at the new size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(16, Math.min(MAX_PREVIEW_DIM, Math.round(rect.width)));
      const h = Math.max(16, Math.min(MAX_PREVIEW_DIM, Math.round(rect.height)));
      setWrapPx({ w, h });
      setPreviewSize(w, h);
    };
    update();
    const observe = new ResizeObserver(update);
    observe.observe(el);
    return () => observe.disconnect();
  }, [setPreviewSize]);

  // Register the canvas with appStore so PNG export and friends can find it.
  useEffect(() => {
    if (!canvasRef.current) return;
    setRenderCanvas(canvasRef.current);
    return () => setRenderCanvas(null);
  }, [setRenderCanvas]);

  // Draw the latest GPU render onto the canvas. The canvas is sized to match
  // the render exactly, so the result fills the wrap with no letterboxing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (lastRender) {
      canvas.width = lastRender.width;
      canvas.height = lastRender.height;
      // `lastRender.pixels` is a Uint8ClampedArray view onto the ArrayBuffer
      // we got over the Tauri IPC boundary — no atob, no copy.
      if (lastRender.pixels.length === lastRender.width * lastRender.height * 4) {
        ctx.putImageData(
          new ImageData(lastRender.pixels, lastRender.width, lastRender.height),
          0,
          0,
        );
      }
    } else {
      canvas.width = Math.max(16, wrapPx.w);
      canvas.height = Math.max(16, wrapPx.h);
      ctx.fillStyle = "#101417";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [lastRender, wrapPx]);

  if (!file) return null;
  const camera = file.scene.camera;
  // The frustum is now a pure compositional guide: it shows what aspect-ratio
  // crop the user would export. It does NOT govern rendering.
  const aspect = parseAspect(file.scene.renderSettings.aspectRatio);
  // Compute the overlay against the displayed canvas, not the wrap. After this
  // change those are the same — but keep the math explicit for when CSS adds
  // padding or a header bleeds in.
  const previewW = lastRender?.width ?? wrapPx.w;
  const previewH = lastRender?.height ?? wrapPx.h;
  const overlay =
    aspect && previewW > 0 && previewH > 0
      ? fitOverlay(previewW, previewH, aspect)
      : null;

  // Crosshair marking the pinned pixel. Computed in render-pixel space (the
  // overlay's viewBox), bottom-left origin flipped to SVG's top-left. Drawn
  // only when the pinned pixel is inside the current render, so a pixel that
  // fell out of bounds after a resize simply isn't marked (and reappears if
  // the canvas grows back to include it).
  const crosshair =
    showCrosshair &&
    pinnedPixel &&
    lastRender &&
    pinnedPixel.x >= 0 &&
    pinnedPixel.x < lastRender.width &&
    pinnedPixel.y >= 0 &&
    pinnedPixel.y < lastRender.height
      ? { cx: pinnedPixel.x + 0.5, cy: lastRender.height - (pinnedPixel.y + 0.5) }
      : null;

  // Gizmo geometry is computed in CSS-pixel (wrap) space so it lines up 1:1
  // with pointer events and the overlay's viewBox. The render fills the wrap
  // at the same aspect ratio, so projecting against wrapPx matches what's on
  // screen even when renderQuality < 1.
  const objPos = file.scene.object.position;
  const gizmo =
    GIZMO_POC_ENABLED && gizmoEnabled && wrapPx.w > 0 && wrapPx.h > 0
      ? computeGizmo(objPos, camera, wrapPx.w, wrapPx.h, GIZMO_HANDLE_PX)
      : null;

  function localXY(e: React.PointerEvent): { x: number; y: number } {
    const rect = wrapRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  /// Pointer position in render-resolution pixels, bottom-left origin — the
  /// Shadertoy iMouse coordinate space (same mapping the pixel inspector
  /// uses). Falls back to the wrap size before the first render lands.
  function mouseXY(e: React.PointerEvent): [number, number] | null {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const w = lastRender?.width ?? wrapPx.w;
    const h = lastRender?.height ?? wrapPx.h;
    const x = ((e.clientX - rect.left) / rect.width) * w;
    const y = (1 - (e.clientY - rect.top) / rect.height) * h;
    return [x, y];
  }

  function samplePixel(e: React.PointerEvent | React.MouseEvent) {
    if (!pixelInspector || !lastRender) {
      setPixelInfo(null);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    // Map CSS pointer position → render-resolution pixel coordinate, then to
    // bottom-left origin (top-row 0 becomes y = height-1) for pixelInfoAt.
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    const xTop = Math.floor(cx * lastRender.width);
    const yTop = Math.floor(cy * lastRender.height);
    setPixelInfo(pixelInfoAt(lastRender, xTop, lastRender.height - 1 - yTop));
  }

  function onPointerDown(e: React.PointerEvent) {
    // Gizmo grabs the pointer before camera controls if a handle is hit.
    if (gizmo && gizmo.origin.visible && e.button === 0) {
      const { x, y } = localXY(e);
      const axis = pickAxis(gizmo, x, y, GIZMO_HIT_PX);
      if (axis >= 0) {
        (e.target as Element).setPointerCapture(e.pointerId);
        gizmoDragRef.current = { axis, x: e.clientX, y: e.clientY };
        setActiveAxis(axis);
        return;
      }
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      shift: e.shiftKey,
    };
    // Shadertoy iMouse: a left click sets both the drag position (xy) and
    // the click position (zw, positive while the button is held).
    if (e.button === 0) {
      const m = mouseXY(e);
      if (m) setMouse([m[0], m[1], m[0], m[1]]);
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!file) return;
    samplePixel(e);

    // Gizmo drag takes priority while active.
    const gd = gizmoDragRef.current;
    if (gd && gizmo) {
      const dx = e.clientX - gd.x;
      const dy = e.clientY - gd.y;
      gd.x = e.clientX;
      gd.y = e.clientY;
      const delta = dragDelta(gizmo.axes[gd.axis], dx, dy);
      const cur = file.scene.object.position;
      setObjectPosition([cur[0] + delta[0], cur[1] + delta[1], cur[2] + delta[2]]);
      return;
    }

    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    if (dragRef.current.button === 0) {
      const m = mouseXY(e);
      if (m) {
        const cur = useAppStore.getState().mouse;
        setMouse([m[0], m[1], cur[2], cur[3]]);
      }
    }
    const cam = { ...file.scene.camera };
    if (dragRef.current.button === 1 || dragRef.current.shift) {
      const dist = vecLen(sub(cam.position, cam.target));
      const speed = (dist / Math.max(wrapPx.h, 1)) * 1.0;
      const right = normalize(
        cross(normalize(sub(cam.target, cam.position)), normalize(cam.up)),
      );
      const localUp = cross(right, normalize(sub(cam.target, cam.position)));
      const dxv = scale(right, -dx * speed);
      const dyv = scale(localUp, dy * speed);
      cam.position = add(cam.position, add(dxv, dyv));
      cam.target = add(cam.target, add(dxv, dyv));
      setCamera(cam);
    } else if (dragRef.current.button === 0) {
      orbit(cam, dx * 0.01, dy * 0.01);
      setCamera(cam);
    }
  }
  // Also used for pointercancel: an OS gesture or window drag can interrupt
  // a drag without ever delivering pointerup, and a stale dragRef would keep
  // the camera following plain hover until the next click.
  function onPointerUp() {
    if (dragRef.current?.button === 0) {
      // Releasing the button flips the click position negative (Shadertoy
      // convention: shaders test sign(iMouse.z) for "button held").
      const cur = useAppStore.getState().mouse;
      if (cur[2] > 0 || cur[3] > 0) {
        setMouse([cur[0], cur[1], -Math.abs(cur[2]), -Math.abs(cur[3])]);
      }
    }
    dragRef.current = null;
    if (gizmoDragRef.current) {
      gizmoDragRef.current = null;
      setActiveAxis(null);
    }
  }
  function onWheel(e: React.WheelEvent) {
    if (!file) return;
    const cam = { ...file.scene.camera };
    const dist = vecLen(sub(cam.position, cam.target));
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const newDist = Math.max(dist * factor, 0.01);
    const dir = normalize(sub(cam.position, cam.target));
    cam.position = add(cam.target, scale(dir, newDist));
    setCamera(cam);
  }
  function resetCamera() {
    setCamera({ ...DEFAULT_CAMERA });
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "f" || e.key === "F") resetCamera();
  }

  const posStr = camera.position.map((n) => n.toFixed(2)).join(", ");

  return (
    <section className="panel render-panel" tabIndex={0} onKeyDown={onKeyDown}>
      <header>
        <span>Render</span>
        <AspectRatioControl />
        <button
          onClick={resetCamera}
          title="Return the camera to its default position and angle (shortcut: F)"
        >
          Reset cam
        </button>
        {GIZMO_POC_ENABLED && (
          <button
            onClick={toggleGizmo}
            className={gizmoEnabled ? "primary" : ""}
            aria-pressed={gizmoEnabled}
            title="Toggle the move gizmo. Drag the X/Y/Z handles to move the object, exposed to shaders as iObjectPosition."
          >
            Move
          </button>
        )}
        <CameraBookmarks />
        <span className="meta cam-pos" title="Camera position">
          [{posStr}]
        </span>
        {gizmoEnabled && (
          <span className="meta obj-pos" title="Object position (iObjectPosition)">
            obj [{objPos.map((n) => n.toFixed(2)).join(", ")}]
          </span>
        )}
        <button
          onClick={togglePixelInspector}
          className={pixelInspector ? "push-right primary" : "push-right"}
          aria-pressed={pixelInspector}
          title="Inspect the pixel under the cursor: its resolution, UV, and color show in the Inspector panel (shortcut: Cmd+I / Alt+I)"
        >
          Inspect
        </button>
        <button
          onClick={toggleCrosshair}
          className={showCrosshair ? "primary" : ""}
          aria-pressed={showCrosshair}
          title="Mark the pinned pixel on the canvas with a crosshair. Set the pixel in the Inspector or Scratchpad."
        >
          Crosshair
        </button>
      </header>
      <div
        ref={wrapRef}
        className="render-canvas-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setPixelInfo(null)}
        onWheel={onWheel}
      >
        <canvas ref={canvasRef} className="render-canvas" />
        <FpsOverlay />
        {showFrustum && overlay && previewW > 0 && previewH > 0 && (
          <svg
            className="frustum-overlay"
            viewBox={`0 0 ${previewW} ${previewH}`}
            preserveAspectRatio="none"
          >
            <rect
              x={overlay.x}
              y={overlay.y}
              width={overlay.width}
              height={overlay.height}
              fill="none"
              stroke="#7ad3ff"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {crosshair && (
          <svg
            className="crosshair-overlay"
            viewBox={`0 0 ${previewW} ${previewH}`}
            preserveAspectRatio="none"
          >
            {/* Full-width/height guide lines plus a box around the pixel, so
                it's easy to point to during a demo. Lines stop short of the
                pixel so the target cell stays legible. */}
            <line
              x1={0}
              y1={crosshair.cy}
              x2={previewW}
              y2={crosshair.cy}
              stroke="#ffd166"
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={crosshair.cx}
              y1={0}
              x2={crosshair.cx}
              y2={previewH}
              stroke="#ffd166"
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={crosshair.cx - 0.5}
              y={crosshair.cy - 0.5}
              width={1}
              height={1}
              fill="none"
              stroke="#ffd166"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {gizmo && gizmo.origin.visible && (
          <svg
            className="gizmo-overlay"
            viewBox={`0 0 ${wrapPx.w} ${wrapPx.h}`}
            preserveAspectRatio="none"
          >
            {gizmo.axes.map((a, i) => {
              const active = activeAxis === i;
              return (
                <g key={i}>
                  <line
                    x1={gizmo.origin.x}
                    y1={gizmo.origin.y}
                    x2={a.tipX}
                    y2={a.tipY}
                    stroke={AXIS_COLORS[i]}
                    strokeWidth={active ? 3.5 : 2}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={a.tipX}
                    cy={a.tipY}
                    r={active ? 6 : 4.5}
                    fill={AXIS_COLORS[i]}
                  />
                </g>
              );
            })}
            <circle
              cx={gizmo.origin.x}
              cy={gizmo.origin.y}
              r={3.5}
              fill="#ffffff"
              stroke="#0c1015"
              strokeWidth={1}
            />
          </svg>
        )}
      </div>
      {pixelInspector && (
        <footer className="pixel-inspector">
          {pixelInfo ? (
            <>
              <span className="pi-group" title="Pixel coordinate (bottom-left origin)">
                <span className="pi-label">Px</span>
                {pixelInfo.px}, {pixelInfo.py}
              </span>
              <span className="pi-group" title="Render resolution">
                <span className="pi-label">Res</span>
                {pixelInfo.resX} × {pixelInfo.resY}
              </span>
              <span className="pi-group" title="UV coordinate (0–1)">
                <span className="pi-label">UV</span>
                {pixelInfo.u.toFixed(3)}, {pixelInfo.v.toFixed(3)}
              </span>
              <span className="pi-group" title="Pixel color (sRGB 0–255)">
                <span className="pi-label">RGB</span>
                {pixelInfo.r}, {pixelInfo.g}, {pixelInfo.b}
                <span
                  className="pi-swatch"
                  style={{ background: `rgb(${pixelInfo.r},${pixelInfo.g},${pixelInfo.b})` }}
                />
              </span>
            </>
          ) : (
            <span className="pi-hint">Hover over render to inspect</span>
          )}
        </footer>
      )}
    </section>
  );
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function vecLen(a: V3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}
function normalize(a: V3): V3 {
  const l = vecLen(a);
  return l < 1e-9 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}
function cross(a: V3, b: V3): V3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function orbit(cam: { position: V3; target: V3 }, yaw: number, pitch: number) {
  const offset: V3 = sub(cam.position, cam.target);
  const r = vecLen(offset);
  if (r < 1e-6) return;
  const a = Math.atan2(offset[0], offset[2]) + yaw;
  const horiz = Math.sqrt(offset[0] * offset[0] + offset[2] * offset[2]);
  let p = Math.atan2(offset[1], horiz) - pitch;
  const limit = Math.PI / 2 - 0.01;
  p = Math.max(-limit, Math.min(limit, p));
  cam.position = [
    cam.target[0] + r * Math.cos(p) * Math.sin(a),
    cam.target[1] + r * Math.sin(p),
    cam.target[2] + r * Math.cos(p) * Math.cos(a),
  ];
}
