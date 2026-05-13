import { lazy, Suspense, useMemo } from "react";
import { cpp } from "@codemirror/lang-cpp";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useSceneStore } from "../state/sceneStore";
import { useAppStore } from "../state/appStore";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

export default function ShaderEditor() {
  const file = useSceneStore((s) => s.file);
  const update = useSceneStore((s) => s.updateShaderSource);
  const diagnostics = useAppStore((s) => s.shaderDiagnostics);

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

  if (!file) return null;
  const source = file.scene.shader.source;
  const errCount = diagnostics.length;

  return (
    <section className="panel editor-panel">
      <header>
        <span>Shader Editor — GLSL</span>
        <span className="meta">{file.scene.shader.compatibility}</span>
        {errCount > 0 && <span className="error-pill">{errCount} error{errCount === 1 ? "" : "s"}</span>}
      </header>
      <Suspense fallback={<div className="editor-loading">Loading editor…</div>}>
        <CodeMirror
          value={source}
          height="100%"
          theme="dark"
          basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
          extensions={[cpp(), lintExt]}
          onChange={(value) => update(value)}
        />
      </Suspense>
    </section>
  );
}
