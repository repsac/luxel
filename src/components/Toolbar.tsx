import { useEffect, useRef, useState } from "react";
import { isFontScalable, useAppStore } from "../state/appStore";
import { useSceneStore, type SceneFile as SceneFileType } from "../state/sceneStore";
import { useConsoleStore } from "../state/consoleStore";
import { formatError, invoke } from "../tauri/commands";
import { exportCanvasAsPng } from "../actions/render";
import { saveCurrentScene } from "../actions/scene";
import { withDefaultLayout } from "../state/layoutStore";
import { EXAMPLES, type ExampleShader } from "../examples";
import { GIZMO_POC_ENABLED } from "../featureFlags";
import LayoutMenu from "./LayoutMenu";
import { HelpButton } from "./HelpModal";
import { AboutButton } from "./AboutModal";
import {
  APP_VERSION,
  BUILD_DIRTY,
  BUILD_NUMBER,
  FULL_BUILD_LABEL,
} from "../build-info";

/// Returns true when the event originated from a text-entry surface (form
/// input, textarea, contenteditable, or CodeMirror's content area). Plain-key
/// playback hotkeys skip those contexts so the user can still type a space,
/// move a cursor with arrow keys, etc.
function isTypingInForm(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.closest(".cm-content")) return true;
  return false;
}

/// Imperative dispatcher for playback actions. Used by both the toolbar key
/// handler below and PlaybackBar — keeps the logic in one place so the
/// hotkeys and the on-screen buttons stay in lockstep.
function playbackAction(
  action: "first" | "last" | "stepBack" | "stepForward" | "playFwd" | "playBwd",
): void {
  const file = useSceneStore.getState().file;
  if (!file) return;
  const t = file.scene.timeline;
  const scene = useSceneStore.getState();
  const app = useAppStore.getState();
  switch (action) {
    case "first":
      app.pause();
      scene.setCurrentFrame(t.firstFrame);
      break;
    case "last":
      app.pause();
      scene.setCurrentFrame(t.lastFrame);
      break;
    case "stepBack":
      app.pause();
      scene.setCurrentFrame(t.currentFrame - 1);
      break;
    case "stepForward":
      app.pause();
      scene.setCurrentFrame(t.currentFrame + 1);
      break;
    case "playFwd":
      app.togglePlay(1);
      break;
    case "playBwd":
      app.togglePlay(-1);
      break;
  }
}

export default function Toolbar() {
  const file = useSceneStore((s) => s.file);
  const dirty = useSceneStore((s) => s.dirty);
  const path = useSceneStore((s) => s.path);
  const replace = useSceneStore((s) => s.replace);
  const replaceFromExample = useSceneStore((s) => s.replaceFromExample);

  const renderQuality = useAppStore((s) => s.renderQuality);
  const setRenderQuality = useAppStore((s) => s.setRenderQuality);
  const autoRender = useAppStore((s) => s.autoRender);
  const showFps = useAppStore((s) => s.showFps);
  const toggleFps = useAppStore((s) => s.toggleFps);
  const canvas = useAppStore((s) => s.renderCanvas);
  const append = useConsoleStore((s) => s.append);

  const [examplesOpen, setExamplesOpen] = useState(false);
  const examplesRef = useRef<HTMLDivElement | null>(null);
  // The Save button re-labels to "Save As…" only while Shift is held *and*
  // the cursor is over the button — so the hint appears exactly where the
  // gesture applies, not globally whenever Shift is down.
  const [shiftHeld, setShiftHeld] = useState(false);
  const [saveHover, setSaveHover] = useState(false);

  useEffect(() => {
    const onShift = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(e.type === "keydown");
    };
    const onBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", onShift);
    window.addEventListener("keyup", onShift);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onShift);
      window.removeEventListener("keyup", onShift);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

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

  // Global keyboard shortcuts.
  //
  // Cmd/Ctrl modifier shortcuts (render, save, editor zoom) always fire, even
  // while the editor or an input is focused — they're system actions.
  //
  // Cmd/Ctrl+Arrow are timeline jumps that we only steal *outside* text
  // contexts, so the OS-native "beginning/end of line" or "word jump"
  // behavior still works while you're typing.
  //
  // Plain-key playback shortcuts (Home/End, Arrow Left/Right, Space) skip
  // any text-entry surface so they don't hijack cursor movement or break
  // typing a literal space character.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingInForm(e.target as HTMLElement);

      // Pixel inspector shortcuts (e.code is layout-independent and dodges the
      // dead-key Alt+I produces on some macOS layouts):
      //   Cmd+I (macOS) / Alt+I (Windows/Linux)        toggle Inspect
      //   Cmd+Shift+I (macOS) / Alt+Shift+I (Windows)  pin the hovered pixel
      // Cmd/Ctrl forms fire anywhere; Alt forms are skipped while typing so
      // they can't swallow an Alt character entry.
      if (e.code === "KeyI") {
        const cmdPin = (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey;
        const altPin = e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey;
        if (cmdPin || (altPin && !typing)) {
          e.preventDefault();
          const hp = useAppStore.getState().hoverPixel;
          if (hp) useAppStore.getState().setPinnedPixel(hp);
          return;
        }
        const cmd = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
        const alt = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey;
        if (cmd || (alt && !typing)) {
          e.preventDefault();
          useAppStore.getState().togglePixelInspector();
          return;
        }
      }

      // ---- Cmd/Ctrl modifier shortcuts (always fire) ----
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        // Routed through the render driver (which computes size/time the
        // same way) so manual renders can't race an in-flight driver render.
        useAppStore.getState().requestRender();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // Shift forces Save As… (choose a new destination).
        void save(e.shiftKey);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        // Font scaling (Cmd/Ctrl +/-/0) applies to the view under the cursor,
        // so one shortcut scales whichever panel you're looking at. We still
        // preventDefault when no scalable view is hovered, so the webview's
        // own zoom doesn't kick in.
        if (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "_" || e.key === "0") {
          e.preventDefault();
          const view = useAppStore.getState().hoveredView;
          if (isFontScalable(view)) {
            if (e.key === "0") useAppStore.getState().resetViewFontSize(view);
            else {
              const delta = e.key === "-" || e.key === "_" ? -1 : 1;
              useAppStore.getState().adjustViewFontSize(view, delta);
            }
          }
          return;
        }
        // Cmd/Ctrl + Left/Right = jump to first/last frame, but only when
        // we're not inside a text field — there those mean "jump to line
        // start/end" (Mac) or "previous/next word" (Windows convention).
        if (!typing && e.key === "ArrowLeft") {
          e.preventDefault();
          playbackAction("first");
          return;
        }
        if (!typing && e.key === "ArrowRight") {
          e.preventDefault();
          playbackAction("last");
          return;
        }
        return;
      }

      // ---- Plain-key playback shortcuts (skipped while typing) ----
      if (typing) return;

      if (e.key === "Home") {
        e.preventDefault();
        playbackAction("first");
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        playbackAction("last");
        return;
      }
      if (e.key === "ArrowLeft" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        playbackAction("stepBack");
        return;
      }
      if (e.key === "ArrowRight" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        playbackAction("stepForward");
        return;
      }
      if (e.key === " ") {
        // Shift+Space plays backward; plain Space plays forward.
        // preventDefault stops the default "activate focused button" behavior
        // so we don't get a double-toggle if a transport button was just
        // clicked and still has focus.
        e.preventDefault();
        playbackAction(e.shiftKey ? "playBwd" : "playFwd");
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function newScene() {
    try {
      const fresh = (await invoke("default_scene")) as SceneFileType;
      replace(withDefaultLayout(fresh));
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
        message: `new failed: ${formatError(e)}`,
      });
    }
  }

  function loadExample(ex: ExampleShader) {
    // We need to capture the loaded example id atomically with the source
    // change so the compatibility picker can recognize "the user is on an
    // unedited example". Doing this through individual setters would race:
    // the updateShaderSource action clears loadedExampleId, so we have to
    // produce the new SceneFile directly and call replaceFromExample.
    const current = useSceneStore.getState().file;
    if (!current) return;
    const entryPoint =
      ex.compatibility === "shadertoy-fragment-v1" ? "mainImage" : "main";
    const next = {
      ...current,
      scene: {
        ...current.scene,
        shader: {
          ...current.scene.shader,
          source: ex.source,
          entryPoint,
          compatibility: ex.compatibility,
        },
      },
    };
    replaceFromExample(next, ex.id);
    append({
      timestamp: new Date().toISOString(),
      level: "info",
      source: "scene",
      message: `loaded example: ${ex.name}`,
    });
    setExamplesOpen(false);
  }

  function render() {
    if (!file) return;
    // Routed through the render driver (which computes size/time the same
    // way) so manual renders can't race an in-flight driver render.
    useAppStore.getState().requestRender();
  }

  async function save(saveAs = false) {
    await saveCurrentScene(saveAs);
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
      // Record the path so the document is recognized as this file: the
      // toolbar shows its name and a later Save writes back here instead of
      // prompting for a new destination.
      replace(loaded, chosen as string);
    } catch (e) {
      append({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "scene",
        message: `open failed: ${formatError(e)}`,
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

  // Filter to only the examples that match the current scene's compatibility.
  // The compatibility picker in the Shader Editor header is the way to flip
  // modes — once flipped, the Examples dropdown shows the matched set for
  // that mode and the old one disappears.
  const currentCompat =
    file?.scene.shader.compatibility ?? "raw-fragment-v1";
  const visible = EXAMPLES.filter(
    (e) =>
      e.compatibility === currentCompat &&
      (GIZMO_POC_ENABLED || !e.experimental),
  );
  const examplesByKind = {
    "2D": visible.filter((e) => e.kind === "2D"),
    "3D": visible.filter((e) => e.kind === "3D"),
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
      <button
        className="save-button"
        onClick={(e) => save(e.shiftKey)}
        onMouseEnter={() => setSaveHover(true)}
        onMouseLeave={() => setSaveHover(false)}
        title={
          shiftHeld && saveHover
            ? "Save As… — choose a new file (Cmd/Ctrl+Shift+S)"
            : "Save the current scene (Cmd/Ctrl+S; hold Shift for Save As…)"
        }
        aria-label={shiftHeld && saveHover ? "Save As" : "Save"}
      >
        {/* Hidden sizer reserves the widest label's width so the toolbar
            doesn't shift when the visible text swaps. */}
        <span className="save-button-sizer" aria-hidden="true">
          Save As…
        </span>
        <span className="save-button-label">
          {shiftHeld && saveHover ? "Save As…" : dirty ? "Save*" : "Save"}
        </span>
      </button>

      <div className="dropdown" ref={examplesRef}>
        <button onClick={() => setExamplesOpen((v) => !v)} title="Load a built-in example shader">
          Examples ▾
        </button>
        {examplesOpen && (
          <div className="dropdown-menu">
            <div className="dropdown-section">
              {currentCompat === "shadertoy-fragment-v1"
                ? "2D · Shadertoy"
                : "2D · Raw GLSL"}
            </div>
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
            <div className="dropdown-section">
              {currentCompat === "shadertoy-fragment-v1"
                ? "3D · Shadertoy"
                : "3D · Raw GLSL"}
            </div>
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

      <button onClick={render} className={autoRender ? "" : "primary"} title="Render (Cmd/Ctrl+Enter)">
        Render
      </button>

      <select
        value={autoRender ? "auto" : "manual"}
        onChange={(e) => useAppStore.getState().setAutoRender(e.target.value === "auto")}
        title="Auto: re-render on every change. Manual: only render on Render button / Cmd+Enter."
      >
        <option value="auto">Auto</option>
        <option value="manual">Manual</option>
      </select>
      <button onClick={exportPng} title="Save the current render as a PNG">
        Export PNG
      </button>

      <button
        onClick={toggleFps}
        className={showFps ? "primary" : ""}
        aria-pressed={showFps}
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
      <AboutButton />
      <span className="spacer" />
      <span className="scene-name">
        {path ? path.split(/[\\/]/).pop() : file?.scene.name ?? "—"}
        {dirty ? " •" : ""}
      </span>
    </div>
  );
}
