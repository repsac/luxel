import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";

/// Bottom-of-app transport controls. Models a DCC timeline:
///   ⏮ start │ ⏪ step-back │ ◀ play-back │ ▶ play-fwd │ ⏩ step-fwd │ ⏭ end
///   ──── slider ──── │ First / Current / Last frame │ Target FPS
///
/// All actions either set `timeline.currentFrame` directly or toggle the
/// playback state in `appStore`. The render driver picks both up automatically
/// on the next animation frame.
export default function PlaybackBar() {
  const file = useSceneStore((s) => s.file);
  const setCurrentFrame = useSceneStore((s) => s.setCurrentFrame);
  const setTimeline = useSceneStore((s) => s.setTimeline);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playDirection = useAppStore((s) => s.playDirection);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const pause = useAppStore((s) => s.pause);

  if (!file) return null;
  const t = file.scene.timeline;
  const range = Math.max(1, t.lastFrame - t.firstFrame);
  const seconds = t.targetFps > 0 ? t.currentFrame / t.targetFps : 0;

  function jumpToStart() {
    pause();
    setCurrentFrame(t.firstFrame);
  }
  function jumpToEnd() {
    pause();
    setCurrentFrame(t.lastFrame);
  }
  function stepBack() {
    pause();
    setCurrentFrame(t.currentFrame - 1);
  }
  function stepForward() {
    pause();
    setCurrentFrame(t.currentFrame + 1);
  }

  function updateFirstFrame(v: number) {
    if (!Number.isFinite(v)) return;
    const clamped = Math.min(Math.round(v), t.lastFrame - 1);
    setTimeline({ firstFrame: clamped });
    if (t.currentFrame < clamped) setCurrentFrame(clamped);
  }
  function updateLastFrame(v: number) {
    if (!Number.isFinite(v)) return;
    const clamped = Math.max(Math.round(v), t.firstFrame + 1);
    setTimeline({ lastFrame: clamped });
    if (t.currentFrame > clamped) setCurrentFrame(clamped);
  }
  function updateTargetFps(v: number) {
    if (!Number.isFinite(v) || v <= 0) return;
    setTimeline({ targetFps: Math.max(0.1, Math.min(240, v)) });
  }

  const playFwdActive = isPlaying && playDirection === 1;
  const playBwdActive = isPlaying && playDirection === -1;

  return (
    <div className="playback-bar">
      <div className="transport">
        <button
          onClick={jumpToStart}
          title="Go to first frame"
          aria-label="First frame"
        >
          ⏮
        </button>
        <button
          onClick={stepBack}
          title="Step back one frame"
          aria-label="Step back"
        >
          ⏴
        </button>
        <button
          onClick={() => togglePlay(-1)}
          className={playBwdActive ? "primary" : ""}
          title="Play backward"
          aria-label="Play backward"
        >
          ◀
        </button>
        <button
          onClick={() => togglePlay(1)}
          className={playFwdActive ? "primary" : ""}
          title="Play forward"
          aria-label="Play forward"
        >
          ▶
        </button>
        <button
          onClick={stepForward}
          title="Step forward one frame"
          aria-label="Step forward"
        >
          ⏵
        </button>
        <button onClick={jumpToEnd} title="Go to last frame" aria-label="Last frame">
          ⏭
        </button>
      </div>

      <div className="playhead">
        <input
          className="timeline-slider"
          type="range"
          min={t.firstFrame}
          max={t.lastFrame}
          step={1}
          value={t.currentFrame}
          onChange={(e) => {
            pause();
            setCurrentFrame(parseInt(e.target.value, 10));
          }}
          aria-label="Timeline scrubber"
        />
        <span className="playhead-readout" title="frame · seconds">
          <span className="frame-cur">{t.currentFrame}</span>
          <span className="frame-sep">/</span>
          <span className="frame-end">{t.lastFrame}</span>
          <span className="frame-time">{seconds.toFixed(2)}s</span>
        </span>
        <span className="frame-range">
          <label title="First frame">
            <span>First</span>
            <input
              type="number"
              value={t.firstFrame}
              onChange={(e) => updateFirstFrame(parseInt(e.target.value, 10))}
            />
          </label>
          <label title="Last frame">
            <span>Last</span>
            <input
              type="number"
              value={t.lastFrame}
              onChange={(e) => updateLastFrame(parseInt(e.target.value, 10))}
            />
          </label>
          <label title="Target playback FPS — affects iTime and play speed">
            <span>FPS</span>
            <input
              type="number"
              min={1}
              max={240}
              step={1}
              value={t.targetFps}
              onChange={(e) => updateTargetFps(parseFloat(e.target.value))}
            />
          </label>
        </span>
      </div>
      <span className="range-meta">
        range {range} fr
      </span>
    </div>
  );
}
