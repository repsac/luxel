import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

/// In-app help overlay covering the controls a new user needs to find their
/// way around: camera, keyboard shortcuts, layout, and the uniforms a shader
/// can read. Keep this short — anything detailed lives in the README.
export default function HelpModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Luxel quick reference</h2>
          <button onClick={onClose}>✕</button>
        </header>
        <div className="help-body">
          <section>
            <h3>Camera (inside the Render view)</h3>
            <table>
              <tbody>
                <tr>
                  <td>Left-drag</td>
                  <td>Orbit around the target</td>
                </tr>
                <tr>
                  <td>Shift+drag or middle-drag</td>
                  <td>Pan (camera and target move together)</td>
                </tr>
                <tr>
                  <td>Scroll wheel</td>
                  <td>Dolly in/out (zoom toward target)</td>
                </tr>
                <tr>
                  <td>
                    <kbd>F</kbd>
                  </td>
                  <td>Reset camera to default</td>
                </tr>
                <tr>
                  <td>Bookmarks ▾</td>
                  <td>Save / restore / delete camera positions</td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              The camera is a "look-at" rig: <code>position</code>,{" "}
              <code>target</code>, <code>up</code>. Orbit rotates{" "}
              <code>position</code> around <code>target</code> while preserving
              distance. Pan slides both. Dolly moves <code>position</code> along
              the line to <code>target</code> without crossing it.
            </p>
          </section>
          <section>
            <h3>Rendering</h3>
            <table>
              <tbody>
                <tr>
                  <td>
                    <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>
                  </td>
                  <td>Re-render the current shader</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd>
                  </td>
                  <td>Save scene</td>
                </tr>
                <tr>
                  <td>Quality (toolbar)</td>
                  <td>
                    Preview render scale. Drop to ½× on heavy shaders if drags
                    feel jerky.
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              A render driver re-fires on the next animation frame whenever the
              camera, render size, or iTime changes — same model as a DCC
              viewport, so navigation is smooth. Editing shader source does{" "}
              <em>not</em> auto-render; use <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>
              {" "}to recompile.
            </p>
          </section>
          <section>
            <h3>Shader uniforms</h3>
            <p>Available in every Shadertoy-style fragment shader:</p>
            <pre>
              {`vec3  iResolution        // viewport size in pixels (x, y, 1)
float iTime              // slider in the toolbar
int   iFrame
vec4  iMouse
vec3  iCameraPosition    // world-space camera position
float iCameraFov         // vertical, radians
vec3  iCameraForward     // normalized
vec3  iCameraRight       // normalized
vec3  iCameraUp          // normalized`}
            </pre>
            <p className="hint">
              Standard 3D ray formula:
              <br />
              <code>
                vec3 rd = normalize(iCameraForward + uv.x * h *
                iCameraRight + uv.y * h * iCameraUp);
              </code>
              <br />
              where <code>h = tan(iCameraFov * 0.5)</code> and{" "}
              <code>uv = (fragCoord * 2.0 - iResolution.xy) /
              iResolution.y</code>.
            </p>
          </section>
          <section>
            <h3>Layout</h3>
            <p>
              Three slots: <strong>top-left</strong>, <strong>top-right</strong>
              , <strong>bottom</strong>. Each slot's bar lets you swap which
              view it shows or hide it. <strong>Layout ▾</strong> in the toolbar
              has presets and visibility checkboxes. Drag the 4px bars between
              panels to resize.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="Quick reference (?)">
        ?
      </button>
      <HelpModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
