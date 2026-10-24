import { useId, type SVGProps } from "react";

/**
 * The highlighted supplier's medal: a gold disc with a star on a gold ribbon. Drawn here, not
 * taken from the icon set, so the gold has depth (a gradient and a rim) and still reads at 14 px.
 */
export function GoldMedal(props: SVGProps<SVGSVGElement>) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 16 16" fill="none" {...props}>
      <defs>
        <linearGradient
          id={gradientId}
          x1="4"
          y1="6"
          x2="12"
          y2="15"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="0.55" stopColor="#F5B932" />
          <stop offset="1" stopColor="#B7791F" />
        </linearGradient>
      </defs>
      <path d="M4.5 1h3l1.6 4.2-2.6 1.2z" fill="#B7791F" />
      <path d="M11.5 1h-3L6.9 5.2l2.6 1.2z" fill="#D69E2E" />
      <circle
        cx="8"
        cy="10.2"
        r="4.8"
        fill={`url(#${gradientId})`}
        stroke="#A16207"
        strokeWidth="0.8"
      />
      <path
        d="m8 7.4.8 1.7 1.8.2-1.35 1.25.38 1.8L8 11.45l-1.63.9.38-1.8L5.4 9.3l1.8-.2z"
        fill="#FFF7D6"
        stroke="#A16207"
        strokeWidth="0.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}
