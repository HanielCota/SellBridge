import { useId, type SVGProps } from "react";

/**
 * A plastic card with a gold chip, drawn here so it reads as a real card next to the Pix symbol;
 * no card brand on it, since any brand works.
 */
export function CreditCardMark(props: SVGProps<SVGSVGElement>) {
  const bodyId = useId();
  const chipId = useId();
  return (
    <svg viewBox="0 0 32 22" fill="none" {...props}>
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="32" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3B5B8C" />
          <stop offset="1" stopColor="#1B2B4B" />
        </linearGradient>
        <linearGradient id={chipId} x1="4" y1="6" x2="10" y2="11" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#C9922E" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="21" rx="3" fill={`url(#${bodyId})`} />
      <rect x="0.5" y="0.5" width="31" height="21" rx="3" stroke="#FFFFFF" strokeOpacity="0.18" />
      <rect x="4" y="6" width="6.5" height="5" rx="1" fill={`url(#${chipId})`} />
      <path d="M4 8.5h6.5M7.25 6v5" stroke="#A16207" strokeWidth="0.5" />
      <rect x="4" y="14.5" width="17" height="1.6" rx="0.8" fill="#FFFFFF" fillOpacity="0.75" />
      <rect x="4" y="17.5" width="9" height="1.4" rx="0.7" fill="#FFFFFF" fillOpacity="0.45" />
    </svg>
  );
}
