/// Convert seconds → frame at the given target FPS. Used by the playback
/// bar's editable seconds readout, extracted into its own module so the
/// rounding behavior is unit-testable.
///
/// Rounds to the nearest integer frame. Falls back to 0 for non-positive or
/// non-finite FPS values — those aren't legal timeline states but defensive
/// guards prevent NaN frames from leaking into the scene.
export function secondsToFrame(seconds: number, targetFps: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(targetFps) || targetFps <= 0) {
    return 0;
  }
  return Math.round(seconds * targetFps);
}

/// Convert frame → seconds at the given target FPS. Exact for non-zero FPS,
/// returns 0 when the FPS isn't usable.
export function frameToSeconds(frame: number, targetFps: number): number {
  if (!Number.isFinite(frame) || !Number.isFinite(targetFps) || targetFps <= 0) {
    return 0;
  }
  return frame / targetFps;
}
