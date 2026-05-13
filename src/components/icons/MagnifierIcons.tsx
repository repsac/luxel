interface IconProps {
  size?: number;
}

const COMMON = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/// Magnifier with a minus inside — zoom-out affordance.
export function MagnifierMinus({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" {...COMMON}>
      <circle cx="6" cy="6" r="4" />
      <path d="M9 9l3.5 3.5" />
      <path d="M4 6h4" />
    </svg>
  );
}

/// Magnifier with a plus inside — zoom-in affordance.
export function MagnifierPlus({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" {...COMMON}>
      <circle cx="6" cy="6" r="4" />
      <path d="M9 9l3.5 3.5" />
      <path d="M6 4v4" />
      <path d="M4 6h4" />
    </svg>
  );
}

/// Magnifier with a center dot — "zoom 1:1" reset affordance.
export function MagnifierReset({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" {...COMMON}>
      <circle cx="6" cy="6" r="4" />
      <path d="M9 9l3.5 3.5" />
      <circle cx="6" cy="6" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
