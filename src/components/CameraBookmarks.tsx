import { useEffect, useRef, useState } from "react";
import { useSceneStore } from "../state/sceneStore";

export default function CameraBookmarks() {
  const file = useSceneStore((s) => s.file);
  const addBookmark = useSceneStore((s) => s.addBookmark);
  const removeBookmark = useSceneStore((s) => s.removeBookmark);
  const setCamera = useSceneStore((s) => s.setCamera);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!file) return null;

  function add() {
    if (!file) return;
    const cam = file.scene.camera;
    const id = `bm-${Date.now().toString(36)}`;
    const n = file.scene.cameraBookmarks.length + 1;
    addBookmark({
      id,
      name: `Bookmark ${n}`,
      position: cam.position,
      target: cam.target,
      up: cam.up,
      fovYDegrees: cam.fovYDegrees,
    });
  }

  function restore(id: string) {
    if (!file) return;
    const b = file.scene.cameraBookmarks.find((x) => x.id === id);
    if (!b) return;
    setCamera({
      ...file.scene.camera,
      position: b.position,
      target: b.target,
      up: b.up,
      fovYDegrees: b.fovYDegrees,
    });
    setOpen(false);
  }

  const count = file.scene.cameraBookmarks.length;

  return (
    <div className="dropdown bookmarks" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} title="Camera bookmarks">
        Bookmarks ({count}) ▾
      </button>
      {open && (
        <div className="dropdown-menu">
          <button className="dropdown-item" onClick={add}>
            + Save current camera
          </button>
          <div className="dropdown-section">Saved</div>
          {file.scene.cameraBookmarks.map((b) => (
            <div className="bookmark-row" key={b.id}>
              <button
                className="dropdown-item bookmark-item"
                onClick={() => restore(b.id)}
                title={`pos [${b.position.map((x) => x.toFixed(2)).join(", ")}]`}
              >
                {b.name}
              </button>
              {b.id !== "default" && (
                <button
                  className="bookmark-remove"
                  onClick={() => removeBookmark(b.id)}
                  title="Delete bookmark"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
