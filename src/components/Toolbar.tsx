import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";
import { useConsoleStore } from "../state/consoleStore";
import { invoke } from "../tauri/commands";
import { exportCanvasAsPng, renderScene } from "../actions/render";
import { EXAMPLES, type ExampleShader } from "../examples";
import LayoutMenu from "./LayoutMenu";
import { HelpButton } from "./HelpModal";
import {
  APP_VERSION,
  BUILD_DIRTY,
  BUILD_NUMBER,
  FULL_BUILD_LABEL,
} from "../build-info";

export default function Toolbar() {
  const file = useSceneStore((s) => s.file);
  const dirty = useSceneStore((s) => s.dirty);
  const path = useSceneStore((s) => s.path);
  const replace = useSceneStore((s) => s.replace);
  const markSaved = useSceneStore((s) => s.markSaved);
  const updateShaderSource = useSceneStore((s) => s.updateShaderSource);

  const iTime = useAppStore((s) => s.iTime);
  const setITime = useAppStore((s) => s.setITime);
  const iFrame = useAppStore((s) => s.iFrame);
  const setIFrame = useAppStore((s) => s.setIFrame);
  const renderQuality = useAppStore((s) => s.renderQuality);
  const setRenderQuality = useAppStore((s) => s.setRenderQuality);
  const showFps = useAppStore((s) => s.showFps);
  const toggleFps = useAppStore((s) => s.toggleFps);
  const canvas = useAppStore((s) => s.renderCanvas);
  const append = useConsoleStore((s) => s.append);

  const [examplesOpen, setExamplesOpen] = useState(false);
  const examplesRef = useRef<HTMLDivElement | null>(null);

  // Close the examples dropdown on outside click.
  useEffect(() => {
    if (!examplesOpen) return;
    const onClick = (e: MouseEvent) => {
      if (examplesRef.current && !examplesRef.current.contains(e.target as Node)) {
        setExamplesOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [examplesOpen]);

  // Cmd/Ctrl+Enter to render anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const f = useSceneStore.getState().file;
        if (f) {
          const a = useAppStore.getState();
          const w = a.previewWidth
            ? Math.max(16, Math.round(a.previewWidth * a.renderQuality))
            : undefined;
          const h = a.previewHeight
            ? Math.max(16, Math.round(a.previewHeight * a.renderQuality))
            : undefined;
          void renderScene({
            scene: f,
            time: a.iTime,
            frame: a.iFrame,
            width: w,
            height: h,
          });
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      // Editor zoom — match standard OS conventions. Cmd/Ctrl+= and Cmd/Ctrl++
      // both mean "zoom in" (the former is what you actually type on US
      // keyboards; the latter is the labeled glyph). We preventDefault so the
      // webview doesn't zoom the whole UI on top of the editor zoom.
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          useAppStore.getState().increaseEditorFontSize();
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          useAppStore.getState().decreaseEditorFontSize();
        } else if (e.key === "0") {
          e.preventDefault();
          useAppStore.getState().resetEditorFontSize();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function newScene() {
    try {
      const fresh = (await invoke("default_scene")) as never;
      replace(fresh);
      append({
        timestamp: new Date().toISOString(),
        level: "info",
        source: "scene",
        message: "new scene created",
      });
    } catch (e) {
      append({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "scene",
        message: `new failed: ${String(e)}`,
      });
    }
  }

  function loadExample(ex: ExampleShader) {
    updateShaderSource(ex.source);
    append({
      timestamp: new Date().toISOString(),
      level: "info",
      source: "scene",
      message: `loaded example: ${ex.name}`,
    });
    setExamplesOpen(false);
  }

  async function render() {
    if (!file) return;
    const a = useAppStore.getState();
    const w = a.previewWidth
      ? Math.max(16, Math.round(a.previewWidth * a.renderQuality))
      : undefined;
    const h = a.previewHeight
      ? Math.max(16, Math.round(a.previewHeight * a.renderQuality))
      : undefined;
    await renderScene({ scene: file, time: iTime, frame: iFrame, width: w, height: h });
  }

  async function save() {
    const current = useSceneStore.getState().file;
    if (!current) return;
    try {
      const dialogMod = await import("@tauri-apps/plugin-dialog");
      let savePath = useSceneStore.getState().path;
      if (!savePath) {
        const chosen = await dialogMod.save({
          filters: [{ name: "Luxel Scene", extensions: ["luxel.json", "json"] }],
        });
        if (!chosen) return;
        savePath = chosen as string;
      }
      await invoke("save_scene", { path: savePath, scene: current });
      markSaved(savePath);
    } catch (e) {
      append({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "scene",
        message: `save failed: ${String(e)}`,
      });
    }
  }

  async function open() {
    try {
      const dialogMod = await import("@tauri-apps/plugin-dialog");
      const chosen = await dialogMod.open({
        multiple: false,
        filters: [{ name: "Luxel Scene", extensions: ["luxel.json", "json"] }],
      });
      if (!chosen || Array.isArray(chosen)) return;
      const loaded = (await invoke("load_scene", { path: chosen })) as never;
      replace(loaded);
    } catch (e) {
      append({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "scene",
        message: `open failed: ${String(e)}`,
      });
    }
  }

  async function exportPng() {
    if (!canvas) {
      append({
        timestamp: new Date().toISOString(),
        level: "warn",
        source: "renderer",
        message: "no render available to export",
      });
      return;
    }
    const base = file?.scene.name?.trim() || "luxel-render";
    const safe = base.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = await exportCanvasAsPng(canvas, `${safe}-${stamp}.png`);
    if (name) {
      append({
        timestamp: new Date().toISOString(),
        level: "info",
        source: "scene",
        message: `exported ${name}`,
      });
    }
  }

  const examplesByKind = {
    "2D": EXAMPLES.filter((e) => e.kind === "2D"),
    "3D": EXAMPLES.filter((e) => e.kind === "3D"),
  };

  return (
    <div className="toolbar">
      <span className="brand">
        Luxel
        <span
          className={`brand-build${BUILD_DIRTY ? " brand-build-dirty" : ""}`}
          title={FULL_BUILD_LABEL}
        >
          v{APP_VERSION}
          <span className="brand-build-num">
            ·{BUILD_NUMBER === "dev" ? "dev" : `#${BUILD_NUMBER}`}
            {BUILD_DIRTY ? "-dirty" : ""}
          </span>
        </span>
      </span>
      <button onClick={newScene} title="Reset to default scene">
        New
      </button>
      <button onClick={open} title="Open a .luxel.json scene">
        Open…
      </button>
      <button onClick={save} title="Save the current scene (Cmd/Ctrl+S)">
        {dirty ? "Save*" : "Save"}
      </button>

      <div className="dropdown" ref={examplesRef}>
        <button onClick={() => setExamplesOpen((v) => !v)} title="Load a built-in example shader">
          Examples ▾
        </button>
        {examplesOpen && (
          <div className="dropdown-menu">
            <div className="dropdown-section">2D</div>
            {examplesByKind["2D"].map((ex) => (
              <button
                key={ex.id}
                className="dropdown-item"
                onClick={() => loadExample(ex)}
                title={ex.description}
              >
                {ex.name}
              </button>
            ))}
            <div className="dropdown-section">3D</div>
            {examplesByKind["3D"].map((ex) => (
              <button
                key={ex.id}
                className="dropdown-item"
                onClick={() => loadExample(ex)}
                title={ex.description}
              >
                {ex.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <LayoutMenu />

      <button onClick={render} className="primary" title="Render (Cmd/Ctrl+Enter)">
        Render
      </button>
      <button onClick={exportPng} title="Save the current render as a PNG">
        Export PNG
      </button>

      <span className="time-control" title="iTime uniform sent to the shader — manual scrub">
        <label>iTime</label>
        <input
          type="range"
          min={0}
          max={60}
          step={0.01}
          value={iTime}
          onChange={(e) => setITime(parseFloat(e.target.value))}
        />
        <span className="value">{iTime.toFixed(2)}</span>
      </span>
      <span className="time-control" title="iFrame uniform sent to the shader">
        <label>iFrame</label>
        <input
          type="number"
          min={0}
          max={100000}
          value={iFrame}
          onChange={(e) => setIFrame(parseInt(e.target.value || "0", 10))}
        />
      </span>
      <button
        onClick={toggleFps}
        className={showFps ? "primary" : ""}
        title="Toggle the FPS overlay in the render view"
      >
        FPS
      </button>
      <span
        className="time-control"
        title="Preview render scale. Lower = faster but blurry; useful for heavy shaders or slow GPUs."
      >
        <label>Quality</label>
        <select
          value={renderQuality}
          onChange={(e) => setRenderQuality(parseFloat(e.target.value))}
        >
          <option value={0.25}>¼×</option>
          <option value={0.5}>½×</option>
          <option value={0.75}>¾×</option>
          <option value={1}>1×</option>
          <option value={1.5}>1.5×</option>
          <option value={2}>2×</option>
        </select>
      </span>

      <HelpButton />
      <span className="spacer" />
      <span className="scene-name">
        {path ? path.split(/[\\/]/).pop() : file?.scene.name ?? "—"}
        {dirty ? " •" : ""}
      </span>
    </div>
  );
}
