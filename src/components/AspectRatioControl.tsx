import { useEffect, useRef, useState } from "react";
import { useSceneStore } from "../state/sceneStore";
import { useAppStore } from "../state/appStore";
import { parseAspect } from "./aspectMath";

const PRESETS = ["1:1", "4:3", "16:9", "21:9"];

export default function AspectRatioControl() {
  const file = useSceneStore((s) => s.file);
  const update = useSceneStore((s) => s.updateRenderSettings);
  // Frustum overlay state is a global UI preference stored in localStorage,
  // not a per-scene setting — flipping it once should stick across every
  // scene the user opens.
  const showFrustumOverlay = useAppStore((s) => s.showFrustumOverlay);
  const setShowFrustumOverlay = useAppStore((s) => s.setShowFrustumOverlay);
  const current = file?.scene.renderSettings.aspectRatio ?? "16:9";

  // Whether the W:H input is shown. Entered by picking "custom…" (which used
  // to be a no-op — the select just snapped back to the previous preset) or
  // by the scene carrying a non-preset ratio; exited by picking a preset.
  const [customMode, setCustomMode] = useState(!PRESETS.includes(current));
  // Custom input mirrors current ratio when it isn't a preset, so the user can
  // tweak the existing value instead of being faced with an empty field.
  const [custom, setCustom] = useState(
    PRESETS.includes(current) ? "" : current,
  );
  const [err, setErr] = useState<string | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!PRESETS.includes(current)) {
      setCustomMode(true);
      if (custom !== current) setCustom(current);
    } else {
      setCustomMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!file) return null;

  const inCustom = customMode || !PRESETS.includes(current);

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
        value={inCustom ? "custom" : current}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setCustomMode(true);
            // Focus after the conditional input mounts.
            requestAnimationFrame(() => customInputRef.current?.focus());
          } else {
            setCustomMode(false);
            setErr(null);
            update({ aspectRatio: e.target.value });
          }
        }}
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="custom">custom…</option>
      </select>
      {inCustom && (
        <>
          <input
            ref={customInputRef}
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
        </>
      )}
      <label className="toggle">
        <input
          type="checkbox"
          checked={showFrustumOverlay}
          onChange={(e) => setShowFrustumOverlay(e.target.checked)}
        />
        Frustum
      </label>
      {err && <span className="error">{err}</span>}
    </div>
  );
}
