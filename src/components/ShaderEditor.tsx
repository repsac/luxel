import { lazy, Suspense, useMemo } from "react";
import { cpp } from "@codemirror/lang-cpp";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useSceneStore, type ShaderCompatibility } from "../state/sceneStore";
import { useAppStore } from "../state/appStore";
import {
  defaultExampleFor,
  findExample,
  findPartnerExample,
} from "../examples";
import {
  MagnifierMinus,
  MagnifierPlus,
  MagnifierReset,
} from "./icons/MagnifierIcons";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

const COMPATIBILITY_LABELS: Record<ShaderCompatibility, string> = {
  "shadertoy-fragment-v1": "Shadertoy (mainImage)",
  "raw-fragment-v1": "Raw GLSL (main)",
};

export default function ShaderEditor() {
  const file = useSceneStore((s) => s.file);
  const dirty = useSceneStore((s) => s.dirty);
  const loadedExampleId = useSceneStore((s) => s.loadedExampleId);
  const update = useSceneStore((s) => s.updateShaderSource);
  const setCompatibility = useSceneStore((s) => s.updateShaderCompatibility);
  const replaceFromExample = useSceneStore((s) => s.replaceFromExample);
  const diagnostics = useAppStore((s) => s.shaderDiagnostics);
  const fontSize = useAppStore((s) => s.editorFontSize);
  const zoomIn = useAppStore((s) => s.increaseEditorFontSize);
  const zoomOut = useAppStore((s) => s.decreaseEditorFontSize);
  const zoomReset = useAppStore((s) => s.resetEditorFontSize);

  const lintExt = useMemo(
    () =>
      linter((view: EditorView): Diagnostic[] => {
        const doc = view.state.doc;
        return diagnostics
          .filter((d) => d.line != null)
          .map<Diagnostic>((d) => {
            const line = Math.min(Math.max(d.line ?? 1, 1), doc.lines);
            const lineObj = doc.line(line);
            const colStart = d.column != null ? Math.max(0, d.column - 1) : 0;
            const from = Math.min(lineObj.from + colStart, lineObj.to);
            return {
              from,
              to: lineObj.to,
              severity: "error",
              message: d.message,
            };
          });
      }),
    [diagnostics],
  );

  const fontSizeExt = useMemo(
    () =>
      EditorView.theme({
        ".cm-content": { fontSize: `${fontSize}px`, lineHeight: "1.45" },
        ".cm-gutters": { fontSize: `${fontSize}px`, lineHeight: "1.45" },
      }),
    [fontSize],
  );

  if (!file) return null;
  const source = file.scene.shader.source;
  const currentCompat = file.scene.shader.compatibility;
  const errCount = diagnostics.length;

  /// Switch the scene's shader compatibility. The behavior depends on what
  /// the user currently has loaded:
  ///   1. **Unedited example** (loadedExampleId set, dirty=false) → swap to
  ///      the partner example in the new mode automatically. No prompt.
  ///   2. **Unsaved edits** (dirty=true) → confirm before replacing. If the
  ///      user accepts, drop into the default example for the new mode.
  ///   3. **Saved file or empty scene** (dirty=false, no example) → drop
  ///      into the default example for the new mode silently.
  function switchCompatibility(target: ShaderCompatibility) {
    if (target === currentCompat) return;

    // Case 1: an example is loaded and untouched. Find the partner and load
    // it directly — no question asked.
    if (loadedExampleId && !dirty) {
      const current = findExample(loadedExampleId);
      if (current) {
        const partner = findPartnerExample(current, target);
        if (partner) {
          loadExampleIntoScene(partner);
          return;
        }
      }
      // No partner exists (shouldn't happen for built-ins today); fall
      // through to the default-example path.
    }

    // Case 2: unsaved edits — ask before clobbering.
    if (dirty) {
      const ok = window.confirm(
        "You have unsaved changes to the shader. Switching compatibility " +
          "will replace your code with the default example for " +
          `${COMPATIBILITY_LABELS[target]}. Continue?\n\n` +
          "Click Cancel to keep your changes and stay in the current mode " +
          "(use Save first if you want to keep your work).",
      );
      if (!ok) return;
    }

    // Case 3 (and case 2 after confirmation): load the default example for
    // the new mode. This always produces a compilable starting point so the
    // user isn't staring at a "main function not found" error.
    loadExampleIntoScene(defaultExampleFor(target));
  }

  function loadExampleIntoScene(ex: import("../examples").ExampleShader) {
    if (!file) return;
    const entryPoint =
      ex.compatibility === "shadertoy-fragment-v1" ? "mainImage" : "main";
    const next = {
      ...file,
      scene: {
        ...file.scene,
        shader: {
          ...file.scene.shader,
          source: ex.source,
          entryPoint,
          compatibility: ex.compatibility,
        },
      },
    };
    replaceFromExample(next, ex.id);
  }

  // Reference unused setters to avoid TS errors after the refactor — the
  // switchCompatibility path supersedes direct setCompatibility/update
  // calls from the picker, but tests and other callers might still want
  // them exposed via the store.
  void setCompatibility;
  void update;

  return (
    <section className="panel editor-panel">
      <header>
        <span>Shader Editor — GLSL</span>
        <select
          className="compat-select"
          value={currentCompat}
          onChange={(e) =>
            switchCompatibility(e.target.value as ShaderCompatibility)
          }
          title="Compatibility mode — switches which entry point the prelude expects"
        >
          {(Object.keys(COMPATIBILITY_LABELS) as ShaderCompatibility[]).map((id) => (
            <option key={id} value={id}>
              {COMPATIBILITY_LABELS[id]}
            </option>
          ))}
        </select>
        <div className="zoom-controls">
          <button onClick={zoomOut} title="Zoom out (Cmd/Ctrl −)" aria-label="Zoom out">
            <MagnifierMinus />
          </button>
          <button
            onClick={zoomReset}
            title={`Reset zoom (Cmd/Ctrl 0) — currently ${fontSize}px`}
            aria-label="Reset zoom"
          >
            <MagnifierReset />
          </button>
          <button onClick={zoomIn} title="Zoom in (Cmd/Ctrl +)" aria-label="Zoom in">
            <MagnifierPlus />
          </button>
        </div>
        {errCount > 0 && (
          <span className="error-pill">
            {errCount} error{errCount === 1 ? "" : "s"}
          </span>
        )}
      </header>
      <Suspense fallback={<div className="editor-loading">Loading editor…</div>}>
        <CodeMirror
          value={source}
          height="100%"
          theme="dark"
          basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
          extensions={[cpp(), lintExt, fontSizeExt]}
          onChange={(value) => useSceneStore.getState().updateShaderSource(value)}
        />
      </Suspense>
    </section>
  );
}
