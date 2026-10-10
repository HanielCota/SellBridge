import { useId } from "react";

const TILE_COLOR = "color-mix(in srgb, var(--brand) 14%, var(--card))";
const STREET_COLOR = "color-mix(in srgb, var(--brand) 26%, var(--card))";
const AVENUE_COLOR = "color-mix(in srgb, var(--brand) 40%, var(--card))";

/** Map-app style mark: a drop pin over an abstract street grid, tinted from the brand tokens. */
export function RegionMapMark({ className }: { className?: string }) {
  const tileClipId = useId();
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <clipPath id={tileClipId}>
          <rect width="48" height="48" rx="14" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${tileClipId})`}>
        <rect width="48" height="48" fill={TILE_COLOR} />
        <g fill="none" stroke={STREET_COLOR} strokeWidth="2">
          <path d="M-2 30 L50 18" />
          <path d="M14 -2 L22 50" />
          <path d="M-2 10 Q20 16 50 6" />
        </g>
        <path d="M34 -2 L30 50" stroke={AVENUE_COLOR} strokeWidth="3.5" />
      </g>
      <ellipse cx="24" cy="37" rx="6" ry="1.8" fill="black" opacity="0.28" />
      <path
        d="M24 36C24 36 14 26.5 14 20a10 10 0 0 1 20 0c0 6.5-10 16-10 16Z"
        fill="var(--brand-text)"
      />
      <circle cx="24" cy="20" r="3.8" fill="var(--card)" />
    </svg>
  );
}
