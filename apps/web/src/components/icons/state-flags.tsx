import type { ReactNode, SVGProps } from "react";
import type { BrazilianState } from "@sellbridge/shared/brazilian-states";
import { FlagFrame, starPath } from "@/components/icons/flag-frame";

const WHITE = "#FFFFFF";
const BLACK = "#1A1A1A";
const RED = "#E1251B";
const GREEN = "#00923F";
const YELLOW = "#FFDF00";
const BLUE = "#1A3E9A";
const SKY = "#2BA8E8";

/** Equal horizontal stripes across the whole flag, top to bottom. */
function Stripes({ colors }: { colors: readonly string[] }) {
  const height = 14 / colors.length;
  return colors.map((color, index) => (
    <rect key={index} y={index * height} width="20" height={height + 0.01} fill={color} />
  ));
}

/** Alternates two colours over `count` stripes, starting with the first. */
function alternate(first: string, second: string, count: number) {
  return Array.from({ length: count }, (_, index) => (index % 2 === 0 ? first : second));
}

/**
 * Each state flag reduced to what still reads at 16 px: the fields, bands and the one mark
 * people recognise (a star, a triangle, a disc). Coats of arms and mottos are left out.
 */
const STATE_FLAG_ARTWORK: Record<BrazilianState, ReactNode> = {
  AC: (
    <>
      <rect width="20" height="14" fill={GREEN} />
      <path d="M0 0H20L0 14Z" fill={YELLOW} />
      <path d={starPath(3.4, 3.4, 1.8)} fill={RED} />
    </>
  ),
  AL: (
    <>
      <rect width="20" height="14" fill={WHITE} />
      <rect width="6.7" height="14" fill={RED} />
      <rect x="13.3" width="6.7" height="14" fill="#0072BC" />
      <circle cx="10" cy="7.4" r="1.7" fill={GREEN} />
    </>
  ),
  AP: (
    <>
      <rect width="20" height="7" fill="#002B7F" />
      <rect y="7" width="20" height="7" fill={YELLOW} />
      <path d="M0 0.8 5 4.6H20V9.4H5L0 13.2Z" fill={GREEN} />
      <path d="M0 0.8 5 4.6H20M0 13.2 5 9.4H20" stroke={BLACK} strokeWidth="0.8" />
      <path d="M2.6 5.8 3.8 7 2.6 8.2 1.4 7Z" fill={WHITE} />
    </>
  ),
  AM: (
    <>
      <Stripes colors={[WHITE, RED, WHITE]} />
      <rect width="7" height="4.7" fill={BLUE} />
      <path d={starPath(3.5, 2.4, 1.3)} fill={WHITE} />
    </>
  ),
  BA: (
    <>
      <Stripes colors={alternate(WHITE, RED, 4)} />
      <rect width="7" height="7" fill={BLUE} />
      <path d="M3.5 1.6 5.6 5.4H1.4Z" fill={WHITE} />
    </>
  ),
  CE: (
    <>
      <rect width="20" height="14" fill={GREEN} />
      <path d="M10 1.6 18.2 7 10 12.4 1.8 7Z" fill={YELLOW} />
      <circle cx="10" cy="7" r="3" fill={WHITE} />
      <circle cx="10" cy="7" r="1.3" fill={GREEN} />
    </>
  ),
  DF: (
    <>
      <rect width="20" height="14" fill={WHITE} />
      <rect x="6.6" y="3.6" width="6.8" height="6.8" fill={GREEN} />
      <path d="M9.4 4.6h1.2v5.8H9.4zM7.1 6.4h5.8v1.2H7.1z" fill={YELLOW} />
    </>
  ),
  ES: <Stripes colors={["#4AA8E0", WHITE, "#F4A3C0"]} />,
  GO: (
    <>
      <Stripes colors={alternate(GREEN, YELLOW, 8)} />
      <rect width="8" height="7" fill={BLUE} />
      <path d={starPath(2.4, 2.3, 1.1)} fill={WHITE} />
      <path d={starPath(5.6, 2.3, 1.1)} fill={WHITE} />
      <path d={starPath(4, 4.9, 1.1)} fill={WHITE} />
    </>
  ),
  MA: (
    <>
      <Stripes colors={[RED, WHITE, BLACK, WHITE, RED, WHITE, BLACK, WHITE, RED]} />
      <rect width="7" height="7.8" fill={BLUE} />
      <path d={starPath(3.5, 4, 2)} fill={WHITE} />
    </>
  ),
  MT: (
    <>
      <rect width="20" height="14" fill="#1B2A6B" />
      <path d="M10 1.6 18.2 7 10 12.4 1.8 7Z" fill={WHITE} />
      <circle cx="10" cy="7" r="3" fill={GREEN} />
      <path d={starPath(10, 7.2, 2.2)} fill={YELLOW} />
    </>
  ),
  MS: (
    <>
      <rect width="20" height="14" fill={SKY} />
      <path d="M0 0H12L0 11.5Z" fill={GREEN} />
      <path d="M12 0H14.6L0 14V11.5Z" fill={WHITE} />
      <path d={starPath(16, 10.6, 1.8)} fill={YELLOW} />
    </>
  ),
  MG: (
    <>
      <rect width="20" height="14" fill={WHITE} />
      <path d="M10 3 14.2 10.4H5.8Z" fill={RED} />
    </>
  ),
  PA: (
    <>
      <rect width="20" height="14" fill={RED} />
      <path d="M0 0H3.4L20 10.6V14H16.6L0 3.4Z" fill={WHITE} />
      <path d={starPath(10, 7.2, 1.8)} fill="#0B3D91" />
    </>
  ),
  PB: (
    <>
      <rect width="20" height="14" fill={RED} />
      <rect width="6.7" height="14" fill={BLACK} />
    </>
  ),
  PR: (
    <>
      <rect width="20" height="14" fill={GREEN} />
      <path d="M0 0H7L20 8V14H13L0 6Z" fill={WHITE} />
      <circle cx="10" cy="7" r="2.6" fill={BLUE} />
      <path d="M7.6 6.4c1.6-.5 3.3-.3 4.8.7" stroke={WHITE} strokeWidth="0.6" />
    </>
  ),
  PE: (
    <>
      <rect width="20" height="14" fill={WHITE} />
      <rect width="20" height="9.3" fill="#1C5DAB" />
      <path d="M6.6 8.2a3.4 3.4 0 0 1 6.8 0" stroke={YELLOW} strokeWidth="0.7" />
      <path d="M5.6 8.2a4.4 4.4 0 0 1 8.8 0" stroke={RED} strokeWidth="0.7" />
      <circle cx="10" cy="6.4" r="1.2" fill={YELLOW} />
      <path d="M9.6 10.3h.8v3h-.8zM9 11.2h2v.7H9z" fill={RED} />
    </>
  ),
  PI: (
    <>
      <Stripes colors={alternate(GREEN, YELLOW, 6)} />
      <rect width="7" height="4.7" fill={BLUE} />
      <path d={starPath(3.5, 2.5, 1.6)} fill={WHITE} />
    </>
  ),
  RJ: (
    <>
      <rect width="20" height="14" fill={WHITE} />
      <rect x="10" width="10" height="7" fill={SKY} />
      <rect y="7" width="10" height="7" fill={SKY} />
      <circle cx="10" cy="7" r="2.2" fill={WHITE} stroke="#1B4F9C" strokeWidth="0.6" />
    </>
  ),
  RN: (
    <>
      <Stripes colors={[GREEN, WHITE]} />
      <path d="M8 4.4H12V8.2L10 9.8 8 8.2Z" fill={YELLOW} stroke={GREEN} strokeWidth="0.4" />
    </>
  ),
  RS: (
    <>
      <rect width="20" height="14" fill={YELLOW} />
      <path d="M0 0H20V5L0 14Z" fill="#DA251D" />
      <path d="M0 0H20L0 9Z" fill={GREEN} />
      <circle cx="10" cy="7" r="1.9" fill={WHITE} />
    </>
  ),
  RO: (
    <>
      <rect width="20" height="7" fill="#1B3B8F" />
      <rect y="7" width="20" height="7" fill={YELLOW} />
      <path d="M0 14 10 7.6 20 14Z" fill={GREEN} />
      <path d={starPath(10, 6.4, 2.6)} fill={WHITE} />
    </>
  ),
  RR: (
    <>
      <rect width="20" height="14" fill={WHITE} />
      <path d="M0 0H8L0 6.5Z" fill={SKY} />
      <path d="M20 5.6V12.4H8.4Z" fill={GREEN} />
      <rect y="12.4" width="20" height="0.7" fill={RED} />
      <path d={starPath(10, 5.4, 3)} fill={YELLOW} />
    </>
  ),
  SC: (
    <>
      <Stripes colors={[RED, WHITE, RED]} />
      <path d="M10 2 16.4 7 10 12 3.6 7Z" fill={GREEN} />
      <circle cx="10" cy="7" r="1.4" fill={WHITE} />
    </>
  ),
  SP: (
    <>
      <Stripes colors={alternate(BLACK, WHITE, 13)} />
      <rect width="7" height="5.4" fill={RED} />
      <circle cx="3.5" cy="2.7" r="1.9" fill={WHITE} />
      <circle cx="3.5" cy="2.7" r="1" fill={BLUE} />
    </>
  ),
  SE: (
    <>
      <Stripes colors={alternate(GREEN, YELLOW, 4)} />
      <rect width="7" height="7" fill={BLUE} />
      <path d={starPath(3.5, 3.6, 1.9)} fill={WHITE} />
    </>
  ),
  TO: (
    <>
      <rect width="20" height="14" fill={WHITE} />
      <path d="M0 0H13L0 9.5Z" fill="#1B4DB8" />
      <path d="M20 4.5V14H7Z" fill={YELLOW} />
      <circle cx="10.6" cy="6.6" r="1.8" fill={YELLOW} />
    </>
  ),
};

/** A state's flag at icon size, framed like the Brazilian flag the "all states" option shows. */
export function StateFlag({
  state,
  ...props
}: SVGProps<SVGSVGElement> & { state: BrazilianState }) {
  return <FlagFrame {...props}>{STATE_FLAG_ARTWORK[state]}</FlagFrame>;
}
