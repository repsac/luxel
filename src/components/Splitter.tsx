import { useCallback, useEffect, useRef } from "react";

interface SplitterProps {
  orientation: "horizontal" | "vertical";
  fraction: number; // 0..1; size of the first child
  onFractionChange: (next: number) => void;
  /// Minimum fraction either side is allowed to shrink to. 0..0.5.
  minFraction?: number;
  containerRef: React.RefObject<HTMLElement | null>;
  /// Optional callback for the brief moment a drag starts/ends, so callers
  /// can suspend expensive auto-renders or show a hover state.
  onDragStateChange?: (dragging: boolean) => void;
}

/// A 1px drag handle between two siblings. `orientation: 'horizontal'` means
/// the bar is horizontal (a vertical split), so dragging it up/down resizes;
/// `vertical` means the bar runs vertically and dragging left/right resizes.
export default function Splitter({
  orientation,
  fraction,
  onFractionChange,
  minFraction = 0.08,
  containerRef,
  onDragStateChange,
}: SplitterProps) {
  const draggingRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      draggingRef.current = true;
      onDragStateChange?.(true);
    },
    [onDragStateChange],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const f =
        orientation === "horizontal"
          ? (e.clientY - rect.top) / Math.max(1, rect.height)
          : (e.clientX - rect.left) / Math.max(1, rect.width);
      const clamped = Math.min(1 - minFraction, Math.max(minFraction, f));
      onFractionChange(clamped);
    },
    [orientation, containerRef, onFractionChange, minFraction],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).releasePointerCapture(e.pointerId);
      draggingRef.current = false;
      onDragStateChange?.(false);
    },
    [onDragStateChange],
  );

  // Clean up if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      if (draggingRef.current) onDragStateChange?.(false);
    };
  }, [onDragStateChange]);

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuemin={Math.round(minFraction * 100)}
      aria-valuemax={Math.round((1 - minFraction) * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
