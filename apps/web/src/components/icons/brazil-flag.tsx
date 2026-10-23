import type { SVGProps } from "react";
import { FlagFrame } from "@/components/icons/flag-frame";

/** The Brazilian flag at icon size. */
export function BrazilFlag(props: SVGProps<SVGSVGElement>) {
  return (
    <FlagFrame {...props}>
      <rect width="20" height="14" fill="#009C3B" />
      <path d="M10 1.6 18.2 7 10 12.4 1.8 7Z" fill="#FFDF00" />
      <circle cx="10" cy="7" r="3.4" fill="#002776" />
      <path
        d="M6.7 6.2c2.2-.4 4.6.1 6.6 1.5"
        stroke="#FFFFFF"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </FlagFrame>
  );
}
