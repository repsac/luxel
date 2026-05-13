import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";
import { fitOverlay, parseAspect } from "./aspectMath";
import AspectRatioControl from "./AspectRatioControl";
import CameraBookmarks from "./CameraBookmarks";
import FpsOverlay from "./FpsOverlay";

type V3 = [number, number, number];

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
  const lastRender = useAppStore((s) => s.lastRender);
  const setRenderCanvas = useAppStore((s) => s.setRenderCanvas);
  const setPreviewSize = useAppStore((s) => s.setPreviewSize);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapPx, setWrapPx] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; button: number; shift: boolean } | null>(
    null,
  );

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
  const showFrustum = file.scene.renderSettings.showFrustumOverlay;

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      shift: e.shiftKey,
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !file) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
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
  function onPointerUp() {
    dragRef.current = null;
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
        <button onClick={resetCamera} title="Reset camera (F)">
          Reset cam
        </button>
        <CameraBookmarks />
        <span className="meta cam-pos" title="Camera position">
          [{posStr}]
        </span>
      </header>
      <div
        ref={wrapRef}
        className="render-canvas-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
      </div>
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
