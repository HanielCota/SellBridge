import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { Line, LineChart, useActiveTooltipLabel, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  formatAxisDate,
  formatTooltipDate,
  type PointGrain,
} from "@/features/reports/dashboard-metrics";
import { hasKpiData, type KpiStoryPoint } from "@/features/reports/kpi-story";
import type { TrendTone } from "@/features/reports/trend-tone";
import { formatMoney, renderActiveDot } from "./chart-frame";

type Bucket = Exclude<PointGrain, "month">;

/** How a tile's values read: with the unit ("12 pedidos") and bare after "anterior:" ("9"). */
export interface KpiValueFormat {
  withUnit: (value: number) => string;
  bare: (value: number) => string;
}

export const MONEY_VALUE: KpiValueFormat = { withUnit: formatMoney, bare: formatMoney };

const countFormat = new Intl.NumberFormat("pt-BR");

export function countValue(noun: { one: string; many: string }): KpiValueFormat {
  return {
    withUnit: (value) => `${countFormat.format(value)} ${value === 1 ? noun.one : noun.many}`,
    bare: (value) => countFormat.format(value),
  };
}

const EMPTY_CONFIG = {} satisfies ChartConfig;

const TONE_STROKES: Record<TrendTone, string> = {
  good: "var(--trend-good)",
  bad: "var(--trend-bad)",
  neutral: "var(--muted-foreground)",
};

const PREVIOUS_STROKE = "var(--muted-foreground)";
const ACTIVE_DOT_RADIUS = 3;
const PLOT_MARGIN = { top: 4, right: 4, bottom: 4, left: 4 };
const CURSOR = { stroke: "var(--foreground)", strokeOpacity: 0.25 };

/**
 * A tap on the chart shows the bucket's value instead of following the tile's link; a mouse click
 * still opens it.
 */
function useTapShowsValue() {
  const lastPointer = useRef("mouse");
  return {
    onPointerDown: (event: PointerEvent) => {
      lastPointer.current = event.pointerType;
    },
    onClick: (event: MouseEvent) => {
      if (lastPointer.current !== "touch") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/** Reports the date the chart's tooltip is on (pointer or finger); rendered inside the chart. */
function ActiveDateTracker({ onChange }: { onChange: (date: string | null) => void }) {
  const label = useActiveTooltipLabel();
  useEffect(() => {
    onChange(typeof label === "string" ? label : null);
  }, [label, onChange]);
  return null;
}

const ROW_CLASSES = "mt-1 flex h-3 justify-between text-[11px] leading-none text-muted-foreground";

/** "4 de nov.: 12 pedidos · anterior: 9", in the date row while a bucket is hovered. */
function HoveredValue({
  point,
  bucket,
  format,
}: {
  point: KpiStoryPoint;
  bucket: Bucket;
  format: KpiValueFormat;
}) {
  return (
    <p className={ROW_CLASSES}>
      <span className="truncate">
        {formatTooltipDate(point.date, bucket)}:{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {point.value === null ? "sem vendas" : format.withUnit(point.value)}
        </span>
        {point.previous === null ? null : (
          <span className="tabular-nums"> · anterior: {format.bare(point.previous)}</span>
        )}
      </span>
    </p>
  );
}

function DateRange({ story, bucket }: { story: readonly KpiStoryPoint[]; bucket: Bucket }) {
  const first = story.at(0);
  const last = story.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  return (
    <p className={ROW_CLASSES}>
      <span>{formatAxisDate(first.date, bucket)}</span>
      <span>{formatAxisDate(last.date, bucket)}</span>
    </p>
  );
}

/** Names both lines, so the dashed one never needs guessing. */
function Legend({ tone }: { tone: TrendTone }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-none text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-0.5 w-3.5 rounded-full"
          style={{ backgroundColor: TONE_STROKES[tone] }}
        />
        Este período
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="w-3.5 border-t-[1.5px] border-dashed border-muted-foreground/70"
        />
        Período anterior
      </span>
    </div>
  );
}

/** The hovered bucket is read in the row under the plot, so the tooltip itself draws nothing. */
const NO_TOOLTIP_CARD = () => null;

function Plot({
  story,
  tone,
  onActiveDate,
}: {
  story: KpiStoryPoint[];
  tone: TrendTone;
  onActiveDate: (date: string | null) => void;
}) {
  return (
    <ChartContainer config={EMPTY_CONFIG} className="aspect-auto h-12 w-full">
      <LineChart data={story} margin={PLOT_MARGIN} accessibilityLayer={false}>
        <XAxis dataKey="date" hide />
        <YAxis hide domain={[0, "dataMax"]} />
        <ActiveDateTracker onChange={onActiveDate} />
        <ChartTooltip cursor={CURSOR} isAnimationActive={false} content={NO_TOOLTIP_CARD} />
        <Line
          type="monotone"
          dataKey="previous"
          stroke={PREVIOUS_STROKE}
          strokeOpacity={0.55}
          strokeDasharray="3 3"
          strokeWidth={1.5}
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={TONE_STROKES[tone]}
          strokeWidth={2}
          strokeLinecap="round"
          dot={false}
          activeDot={renderActiveDot(TONE_STROKES[tone], ACTIVE_DOT_RADIUS)}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

interface CompareSparklineProps {
  story: KpiStoryPoint[];
  bucket: Bucket;
  tone: TrendTone;
  format: KpiValueFormat;
}

function ChartWithRows({ story, bucket, tone, format }: CompareSparklineProps) {
  const tap = useTapShowsValue();
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const point = story.find((storyPoint) => storyPoint.date === activeDate);
  return (
    // The tile's figures already speak for it; the chart is for the eye.
    <div data-slot="compare-sparkline" aria-hidden="true" {...tap}>
      <Plot story={story} tone={tone} onActiveDate={setActiveDate} />
      {point === undefined ? (
        <DateRange story={story} bucket={bucket} />
      ) : (
        <HoveredValue point={point} bucket={bucket} format={format} />
      )}
      <Legend tone={tone} />
    </div>
  );
}

/**
 * A tile's period at a glance: this period as the strong line, colored like the tile's change,
 * and the previous period faint and dashed behind it, with the dates and a legend under them;
 * hovering or touching a bucket reads its value in place of the dates. Without any value in
 * either period it says so in a quiet line instead.
 */
export function CompareSparkline(props: CompareSparklineProps) {
  if (hasKpiData(props.story)) {
    return <ChartWithRows {...props} />;
  }
  return <p className="text-xs text-muted-foreground">Nenhum pedido no período.</p>;
}
