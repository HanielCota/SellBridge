import { useId, type ReactNode, type SVGProps } from "react";

/**
 * A 10:7 flag drawn inside a square box, so the `size-*` classes the other icons use keep it
 * in line with them. The children draw in a 20 × 14 space; the frame rounds and outlines it.
 */
export function FlagFrame({
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="20" height="14" rx="2.5" />
        </clipPath>
      </defs>
      <g transform="translate(0 3)">
        <g clipPath={`url(#${clipId})`}>{children}</g>
        <rect
          x="0.25"
          y="0.25"
          width="19.5"
          height="13.5"
          rx="2.25"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="0.5"
        />
      </g>
    </svg>
  );
}

const STAR_POINTS = 5;
const STAR_INNER_RATIO = 0.4;

/** A five-pointed star path centred on (centerX, centerY), its tips `radius` away from the centre. */
export function starPath(centerX: number, centerY: number, radius: number) {
  const corners = Array.from({ length: STAR_POINTS * 2 }, (_, index) => {
    const distance = index % 2 === 0 ? radius : radius * STAR_INNER_RATIO;
    const angle = (Math.PI / STAR_POINTS) * index - Math.PI / 2;
    return `${(centerX + distance * Math.cos(angle)).toFixed(2)} ${(centerY + distance * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${corners.join("L")}Z`;
}
