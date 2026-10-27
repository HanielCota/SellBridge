import { CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

/**
 * The frame every dashboard chart shares (the reseller's cash flow and the supplier home, item
 * 38): money formats, the plot margins and axes, the hover dot and the legend marks, so a chart
 * of either dashboard reads the same. The hover card lives in `chart-tooltip.tsx`.
 */

/** Axis labels stay short: "R$ 1,2 mil". */
export const axisMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const tooltipMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function formatMoney(cents: number): string {
  return tooltipMoney.format(Math.round(cents / 100));
}

export const formatMoneyTick = (cents: number) => axisMoney.format(cents / 100);

// The bottom margin holds the date labels' whole line box inside the plot, not just their glyphs.
export const CHART_MARGIN = { left: 0, right: 8, top: 24, bottom: 4 };
export const LINE_CURSOR = {
  stroke: "var(--foreground)",
  strokeOpacity: 0.35,
  strokeDasharray: "4 4",
};

/**
 * Which x labels survive when they do not all fit: categories keep every one; an hourly day keeps
 * its first and last hour (thinning from the start dropped "0h" late in the day); dates keep the
 * latest one.
 */
function xTickInterval(
  everyTick: boolean,
  keepStart: boolean,
): 0 | "preserveStartEnd" | "preserveEnd" {
  if (everyTick) {
    return 0;
  }
  return keepStart ? "preserveStartEnd" : "preserveEnd";
}

/**
 * Grid and axes every chart shares, so switching kinds never moves the frame. The grid is a
 * solid hairline (dashes are kept for reference lines); zero gets a firmer line when the chart
 * dips below it.
 */
export function renderFrame({
  scale,
  formatY,
  xKey = "date",
  formatX = (value) => value,
  everyTick = false,
  keepStart = false,
}: {
  scale: { domain: [number, number]; ticks: number[] };
  formatY: (value: number) => string;
  xKey?: string;
  formatX?: (value: string) => string;
  /** Categories (not dates): every one is labeled, none may be skipped. */
  everyTick?: boolean;
  /** Hours of one day: the first label always shows where the day starts. */
  keepStart?: boolean;
}) {
  return [
    <CartesianGrid key="grid" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />,
    <XAxis
      key="x"
      dataKey={xKey}
      tickLine={false}
      axisLine={false}
      tickMargin={12}
      minTickGap={40}
      interval={xTickInterval(everyTick, keepStart)}
      tickFormatter={formatX}
    />,
    <YAxis
      key="y"
      // Sized to the widest label, so "R$ 2,5 mil" keeps its "R" and starts on the card's edge.
      width="auto"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      domain={scale.domain}
      ticks={scale.ticks}
      // A line sitting on zero keeps its whole stroke inside the plot.
      padding={{ top: 0, bottom: 4 }}
      tickFormatter={formatY}
    />,
    scale.domain[0] < 0 ? (
      <ReferenceLine key="zero" y={0} stroke="var(--foreground)" strokeOpacity={0.4} />
    ) : null,
  ];
}

/** Hover dot ringed with the card color, so it lifts off the line beneath it. */
export function renderActiveDot(color: string, radius: number) {
  return ({ cx, cy }: { cx?: number | undefined; cy?: number | undefined }) => (
    <circle cx={cx} cy={cy} r={radius} fill={color} stroke="var(--card)" strokeWidth={2} />
  );
}

export const SOLID_KEY = (
  <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-foreground/70" />
);
export const DASHED_KEY = (
  <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-foreground/50" />
);
