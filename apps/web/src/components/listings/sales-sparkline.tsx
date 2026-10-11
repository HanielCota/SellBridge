import { useId } from "react";
import { cn } from "@/lib/utils";

const WIDTH = 96;
const HEIGHT = 28;
const STROKE_INSET = 2;
/**
 * The scale never goes below this many units a day, so a product selling one unit now and
 * then draws a calm line near the floor instead of a zigzag that looks like a spike.
 */
const SCALE_FLOOR = 6;

function linePoints(dailySales: readonly number[]): string[] {
  const top = Math.max(SCALE_FLOOR, ...dailySales);
  const step = WIDTH / Math.max(dailySales.length - 1, 1);
  const drawable = HEIGHT - STROKE_INSET * 2;
  return dailySales.map((units, index) => {
    const horizontal = Math.round(index * step * 10) / 10;
    const vertical = Math.round((HEIGHT - STROKE_INSET - (units / top) * drawable) * 10) / 10;
    return `${horizontal},${vertical}`;
  });
}

/** Units sold per day as a small line with a soft fill; decorative, the figure beside it reads out. */
export function SalesSparkline({
  dailySales,
  muted = false,
}: {
  dailySales: readonly number[];
  muted?: boolean;
}) {
  const gradientId = useId();
  if (dailySales.length < 2) {
    return null;
  }
  const points = linePoints(dailySales);
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden="true"
      className={cn("shrink-0", muted ? "text-muted-foreground" : "text-chart-brand")}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M0,${HEIGHT} L${points.join(" L")} L${WIDTH},${HEIGHT} Z`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
