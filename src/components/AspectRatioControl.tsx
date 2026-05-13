import { useEffect, useState } from "react";
import { useSceneStore } from "../state/sceneStore";
import { parseAspect } from "./aspectMath";

const PRESETS = ["1:1", "4:3", "16:9", "21:9"];

export default function AspectRatioControl() {
  const file = useSceneStore((s) => s.file);
  const update = useSceneStore((s) => s.updateRenderSettings);
  const current = file?.scene.renderSettings.aspectRatio ?? "16:9";

  // Custom input mirrors current ratio when it isn't a preset, so the user can
  // tweak the existing value instead of being faced with an empty field.
  const [custom, setCustom] = useState(
    PRESETS.includes(current) ? "" : current,
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!PRESETS.includes(current) && custom !== current) setCustom(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!file) return null;

  function applyCustom() {
    const parsed = parseAspect(custom);
    if (!parsed) {
      setErr("Use W:H with positive integers");
      return;
    }
    setErr(null);
    update({ aspectRatio: `${parsed.num}:${parsed.den}` });
  }

  return (
    <div className="aspect-control">
      <label>Aspect</label>
      <select
        value={PRESETS.includes(current) ? current : "custom"}
        onChange={(e) => {
          if (e.target.value !== "custom") update({ aspectRatio: e.target.value });
        }}
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="custom">custom…</option>
      </select>
      <input
        type="text"
        placeholder="W:H"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") applyCustom();
        }}
        size={6}
      />
      <button onClick={applyCustom}>Set</button>
      <label className="toggle">
        <input
          type="checkbox"
          checked={file.scene.renderSettings.showFrustumOverlay}
          onChange={(e) => update({ showFrustumOverlay: e.target.checked })}
        />
        Frustum
      </label>
      {err && <span className="error">{err}</span>}
    </div>
  );
}
