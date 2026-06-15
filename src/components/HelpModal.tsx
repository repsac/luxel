import { useEffect, useRef, useState } from "react";
import { FULL_BUILD_LABEL } from "../build-info";

interface Props {
  open: boolean;
  onClose: () => void;
}

/// In-app help overlay covering the controls a new user needs to find their
/// way around: camera, keyboard shortcuts, layout, and the uniforms a shader
/// can read. Keep this short — anything detailed lives in the README.
export default function HelpModal({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the dialog on open and back to the trigger on close, so
  // keyboard users aren't left tabbing through the toolbar underneath.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => prev?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="help-overlay"
      // mousedown (not click) with a target check: a text-selection drag that
      // starts inside the panel and releases on the overlay dispatches click
      // on the overlay, which would dismiss the modal mid-selection.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="help-modal-title">Luxel quick reference</h2>
          <span className="help-build">{FULL_BUILD_LABEL}</span>
          <button onClick={onClose} aria-label="Close">✕</button>
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
                  <td>Save scene (writes back to the open file)</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>
                  </td>
                  <td>Save As… — choose a new file (or hold Shift and click Save)</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Cmd</kbd>+<kbd>I</kbd> / <kbd>Alt</kbd>+<kbd>I</kbd>
                  </td>
                  <td>Toggle the pixel inspector (macOS / Windows)</td>
                </tr>
                <tr>
                  <td>Quality (toolbar)</td>
                  <td>
                    Preview render scale. Drop to ½× on heavy shaders if drags
                    feel jerky.
                  </td>
                </tr>
                <tr>
                  <td>
                    <kbd>Cmd/Ctrl</kbd>+<kbd>=</kbd> / <kbd>−</kbd> / <kbd>0</kbd>
                  </td>
                  <td>Editor zoom in / out / reset (magnifier buttons in the editor header)</td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              A render driver re-fires on the next animation frame whenever the
              camera, render size, or current frame changes — same model as a
              DCC viewport, so navigation is smooth. Editing shader source does{" "}
              <em>not</em> auto-render; use <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>
              {" "}to recompile.
            </p>
          </section>
          <section>
            <h3>Timeline (playback bar at the bottom)</h3>
            <table>
              <tbody>
                <tr><td>⏮ / ⏭</td><td>Jump to first / last frame</td></tr>
                <tr><td>⏴ / ⏵</td><td>Step one frame backward / forward</td></tr>
                <tr><td>◀ / ▶</td><td>Play backward / forward; click again to pause</td></tr>
                <tr><td>Slider</td><td>Scrub the playhead (pauses playback)</td></tr>
                <tr><td>First / Last / FPS</td><td>Edit timeline bounds and playback rate</td></tr>
                <tr>
                  <td><kbd>Space</kbd></td>
                  <td>Play forward / pause</td>
                </tr>
                <tr>
                  <td><kbd>Shift</kbd>+<kbd>Space</kbd></td>
                  <td>Play backward / pause</td>
                </tr>
                <tr>
                  <td><kbd>←</kbd> / <kbd>→</kbd></td>
                  <td>Step one frame back / forward</td>
                </tr>
                <tr>
                  <td><kbd>Home</kbd> / <kbd>End</kbd></td>
                  <td>Jump to first / last frame</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Cmd/Ctrl</kbd>+<kbd>←</kbd> /{" "}
                    <kbd>Cmd/Ctrl</kbd>+<kbd>→</kbd>
                  </td>
                  <td>Jump to first / last frame (alias for Home/End)</td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              <code>iFrame = currentFrame</code> and{" "}
              <code>iTime = currentFrame / targetFps</code>. The playhead value
              is saved with the scene; playing/paused state is not. Playback
              hotkeys are suppressed while you're typing in the editor or an
              input field so they don't hijack normal text editing.
            </p>
          </section>
          <section>
            <h3>Shader compatibility modes</h3>
            <p>
              The compatibility dropdown in the editor header picks how your
              source is wrapped before going to the GPU:
            </p>
            <table>
              <tbody>
                <tr>
                  <td>
                    <strong>Shadertoy (mainImage)</strong>
                  </td>
                  <td>
                    Write{" "}
                    <code>void mainImage(out vec4 fragColor, in vec2 fragCoord)</code>
                    . Luxel wraps it in a generated <code>main()</code> and
                    handles the output binding for you. Best for porting
                    shaders from shadertoy.com.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Raw GLSL (main)</strong>
                  </td>
                  <td>
                    Write your own <code>void main()</code> and assign to the
                    prelude-provided <code>outColor</code>. <code>v_uv</code>
                    {" "}([0,0] bottom-left to [1,1] top-right) and every
                    uniform are still injected.
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              Loading an example from the dropdown automatically switches to
              the compatibility mode it expects.
            </p>
            <h3 className="hint-heading">GLSL dialect</h3>
            <p className="hint">
              Under the hood Luxel accepts <strong>GLSL 4.50 in the
              Vulkan/SPIR-V dialect</strong> (via{" "}
              <a href="https://github.com/gfx-rs/wgpu/tree/trunk/naga">naga</a>
              ). naga's GLSL frontend doesn't accept{" "}
              <code>#version 330</code> or older, so a "GLSL 3.3 mode" isn't
              available as a separate picker option.
            </p>
            <p className="hint">
              Porting 3.3 fragment-shader code: drop your{" "}
              <code>#version</code> line at the top (the prelude provides
              one), use Raw GLSL mode, and avoid 4.x-only features —{" "}
              <code>imageLoad</code>/<code>Store</code>, SSBOs, atomic
              counters, tessellation, and compute. For typical raymarchers
              and effect shaders the body translates with zero edits.
            </p>
          </section>
          <section>
            <h3>Shader uniforms</h3>
            <p>Available in both Shadertoy and raw modes:</p>
            <pre>
              {`vec3  iResolution        // viewport size in pixels (x, y, 1)
float iTime              // currentFrame / targetFps
int   iFrame             // currentFrame
vec4  iMouse             // xy = drag pos, zw = click pos (z<0 when up)
vec3  iCameraPosition    // world-space camera position
float iCameraFov         // vertical, radians
vec3  iCameraForward     // normalized
vec3  iCameraRight       // normalized
vec3  iCameraUp          // normalized

// Raw mode also exposes:
in  vec2 v_uv;           // [0,0] bottom-left, [1,1] top-right
out vec4 outColor;       // write your final color here`}
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
