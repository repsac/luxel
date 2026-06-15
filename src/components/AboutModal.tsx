import { useEffect, useRef, useState } from "react";
import { FULL_BUILD_LABEL } from "../build-info";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: Props) {
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
        className="help-modal about-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="about-modal-title">About Luxel</h2>
          <button onClick={onClose} aria-label="Close">&#x2715;</button>
        </header>
        <div className="help-body about-body">
          <p className="about-tagline">
            A local, developer-focused GLSL shader workbench.
          </p>
          <table className="about-table">
            <tbody>
              <tr>
                <td>Author</td>
                <td>Ed Caspersen</td>
              </tr>
              <tr>
                <td>Build</td>
                <td>{FULL_BUILD_LABEL}</td>
              </tr>
              <tr>
                <td>License</td>
                <td>MIT</td>
              </tr>
              <tr>
                <td>Source</td>
                <td>
                  <a
                    href="https://github.com/repsac/luxel"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    github.com/repsac/luxel
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="about-license-text">
            Copyright &copy; 2026 Ed Caspersen. Released under the MIT License.
            See the LICENSE file in the project root for full terms.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AboutButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="About Luxel">
        &#x24D8;
      </button>
      <AboutModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
