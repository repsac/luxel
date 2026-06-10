import { useEffect, useState } from "react";
import { FULL_BUILD_LABEL } from "../build-info";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: Props) {
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
      <div
        className="help-modal about-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>About Luxel</h2>
          <button onClick={onClose}>&#x2715;</button>
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
