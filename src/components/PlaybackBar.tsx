import { useEffect, useState } from "react";
import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";
import { frameToSeconds, secondsToFrame } from "./playbackMath";

/// Bottom-of-app transport controls. Models a DCC timeline:
///   ⏮ start │ ⏪ step-back │ ◀ play-back │ ▶ play-fwd │ ⏩ step-fwd │ ⏭ end
///   ──── slider ──── │ Current frame · time │ First / Last / FPS
///
/// The current-frame and seconds readouts are both editable: type a frame
/// number or a time in seconds and the playhead jumps there. Seconds are
/// the more natural unit for Shadertoy-style work; frames are the natural
/// unit for animation export.
export default function PlaybackBar() {
  const file = useSceneStore((s) => s.file);
  const setCurrentFrame = useSceneStore((s) => s.setCurrentFrame);
  const setTimeline = useSceneStore((s) => s.setTimeline);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playDirection = useAppStore((s) => s.playDirection);
  const loopPlayback = useAppStore((s) => s.loopPlayback);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const toggleLoopPlayback = useAppStore((s) => s.toggleLoopPlayback);
  const pause = useAppStore((s) => s.pause);

  if (!file) return null;
  const t = file.scene.timeline;
  const range = Math.max(1, t.lastFrame - t.firstFrame);
  const seconds = frameToSeconds(t.currentFrame, t.targetFps);

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

  function commitFrame(n: number) {
    pause();
    setCurrentFrame(n);
  }
  function commitSeconds(s: number) {
    pause();
    // Convert seconds → frames using the current target FPS. Clamp through
    // setCurrentFrame's own bounds check; we just round.
    setCurrentFrame(secondsToFrame(s, t.targetFps));
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
          title="Go to first frame (Home)"
          aria-label="First frame"
        >
          ⏮
        </button>
        <button
          onClick={stepBack}
          title="Step back one frame (←)"
          aria-label="Step back"
        >
          ⏴
        </button>
        <button
          onClick={() => togglePlay(-1)}
          className={playBwdActive ? "primary" : ""}
          aria-pressed={playBwdActive}
          title="Play backward (Shift+Space)"
          aria-label="Play backward"
        >
          ◀
        </button>
        <button
          onClick={() => togglePlay(1)}
          className={playFwdActive ? "primary" : ""}
          aria-pressed={playFwdActive}
          title="Play forward (Space)"
          aria-label="Play forward"
        >
          ▶
        </button>
        <button
          onClick={stepForward}
          title="Step forward one frame (→)"
          aria-label="Step forward"
        >
          ⏵
        </button>
        <button onClick={jumpToEnd} title="Go to last frame (End)" aria-label="Last frame">
          ⏭
        </button>
        <button
          onClick={toggleLoopPlayback}
          className={loopPlayback ? "primary" : ""}
          aria-pressed={loopPlayback}
          title="Loop playback — wrap around at timeline bounds"
          aria-label="Toggle loop"
        >
          🔁
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
        <span className="playhead-readout">
          <NumericReadoutInput
            className="frame-cur-input"
            value={t.currentFrame}
            format={(n) => String(Math.round(n))}
            onCommit={commitFrame}
            step={1}
            title="Current frame (editable). Type a frame number to jump."
            aria-label="Current frame"
          />
          <span className="frame-sep">/</span>
          <span className="frame-end">{t.lastFrame}</span>
          <NumericReadoutInput
            className="frame-time-input"
            value={seconds}
            format={(n) => n.toFixed(2)}
            onCommit={commitSeconds}
            step={0.01}
            suffix="s"
            title="iTime (editable, in seconds). Computed as currentFrame / targetFps."
            aria-label="Current time in seconds"
          />
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

interface NumericReadoutInputProps {
  className?: string;
  /// The authoritative value sourced from store state.
  value: number;
  /// How to format `value` into the input's displayed string when not focused.
  format: (n: number) => string;
  /// Called with the parsed number when the user finishes editing (blur or
  /// Enter). Not called for intermediate keystrokes — that would fight the
  /// user mid-type during playback.
  onCommit: (n: number) => void;
  step?: number;
  /// Optional suffix appended visually (e.g., "s" for seconds). Rendered as
  /// a sibling span; the input itself remains type="number".
  suffix?: string;
  title?: string;
  "aria-label"?: string;
}

/// Editable number readout that keeps the user's in-progress text in local
/// state while focused, and syncs from the external `value` only when blurred.
/// Without this split, a controlled input would clobber what the user is
/// typing every time the playback driver advanced the frame.
function NumericReadoutInput(props: NumericReadoutInputProps) {
  const { className, value, format, onCommit, step, suffix, title } = props;
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);

  // Pull external updates into the displayed text whenever we're not the one
  // driving — i.e., the playback loop advanced the frame, or the slider was
  // dragged. `format` is intentionally not a dep: it changes by reference on
  // every render but is functionally stable.
  useEffect(() => {
    if (!focused) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  function commit(raw: string) {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) {
      onCommit(parsed);
    }
    // Snap the input back to the canonical format regardless — invalid
    // input rolls back to whatever the store now reports.
    setText(format(Number.isFinite(parsed) ? parsed : value));
  }

  return (
    <span className="readout-cell">
      <input
        className={className}
        type="number"
        step={step}
        value={text}
        title={title}
        aria-label={props["aria-label"]}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          // Select-all on focus so a user can immediately type a new value
          // without having to clear the existing one first — natural DCC
          // input affordance.
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            // Cancel: drop the in-progress edit and re-sync from value.
            setText(format(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {suffix && <span className="readout-suffix">{suffix}</span>}
    </span>
  );
}
