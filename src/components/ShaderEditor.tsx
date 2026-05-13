import { lazy, Suspense, useMemo } from "react";
import { cpp } from "@codemirror/lang-cpp";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useSceneStore } from "../state/sceneStore";
import { useAppStore } from "../state/appStore";
import {
  MagnifierMinus,
  MagnifierPlus,
  MagnifierReset,
} from "./icons/MagnifierIcons";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

export default function ShaderEditor() {
  const file = useSceneStore((s) => s.file);
  const update = useSceneStore((s) => s.updateShaderSource);
  const diagnostics = useAppStore((s) => s.shaderDiagnostics);
  const fontSize = useAppStore((s) => s.editorFontSize);
  const zoomIn = useAppStore((s) => s.increaseEditorFontSize);
  const zoomOut = useAppStore((s) => s.decreaseEditorFontSize);
  const zoomReset = useAppStore((s) => s.resetEditorFontSize);

  // Recompute the lint extension whenever the diagnostics list changes so
  // CodeMirror re-renders the markers without us digging into the editor view.
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

  // Apply the current zoom level via a theme extension. CodeMirror's default
  // theme hard-codes font-size on `.cm-content` and `.cm-gutters`; overriding
  // both keeps the gutter and code in lockstep so line numbers don't drift.
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
  const errCount = diagnostics.length;

  return (
    <section className="panel editor-panel">
      <header>
        <span>Shader Editor — GLSL</span>
        <span className="meta">{file.scene.shader.compatibility}</span>
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
          onChange={(value) => update(value)}
        />
      </Suspense>
    </section>
  );
}
