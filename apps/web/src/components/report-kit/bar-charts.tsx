import { barAxis, positionOf, type ChartAxis } from "@/features/report-kit/chart-scale";
import { formatCompactValue, formatReportValue, rateOf } from "@/features/report-kit/report-format";
import type {
  ReportAttentionItem,
  ReportBarItem,
  ReportBucket,
  ReportSplitRow,
  ReportValueFormat,
} from "@/features/report-kit/report-model";

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
});

/** Light grid lines with 5 marks on the left; the bars are drawn inside, never past the top. */
function PlotGrid({ axis, format }: { axis: ChartAxis; format: ReportValueFormat }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {axis.ticks.map((tick) => (
        <div
          key={tick}
          className="absolute inset-x-0 flex items-center gap-2"
          style={{ bottom: `${positionOf(tick, axis)}%` }}
        >
          <span className="w-16 -translate-y-1/2 whitespace-nowrap text-right text-[11px] text-muted-foreground tabular-nums">
            {formatCompactValue(tick, format)}
          </span>
          <span className="h-px flex-1 -translate-y-1/2 bg-border" />
        </div>
      ))}
    </div>
  );
}

function Bar({
  value,
  axis,
  format,
  color,
  showValue,
}: {
  value: number;
  axis: ChartAxis;
  format: ReportValueFormat;
  color: string;
  showValue: boolean;
}) {
  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col justify-end">
      <div
        className="rounded-t-md"
        style={{ height: `${positionOf(value, axis)}%`, background: color }}
      >
        {showValue ? (
          <span className="absolute left-1/2 -translate-x-1/2 -translate-y-full pb-0.5 text-center text-[11px] font-medium whitespace-nowrap tabular-nums">
            {formatCompactValue(value, format)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <p className="mt-3 flex gap-4 text-footnote text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-chart-brand" aria-hidden="true" />
        Este período
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-chart-compare" aria-hidden="true" />
        Período anterior
      </span>
    </p>
  );
}

function describeBars(items: readonly ReportBarItem[], format: ReportValueFormat): string {
  return items
    .map(
      (item) =>
        `${item.label}: ${formatReportValue(item.current, format)} (antes ${formatReportValue(item.previous, format)})`,
    )
    .join("; ");
}

const CROWDED_GROUPS = 3;

/** Current period in the brand color next to the previous one in the comparison color. */
export function GroupedBarsChart({
  items,
  format,
  showValues,
}: {
  items: readonly ReportBarItem[];
  format: ReportValueFormat;
  showValues: boolean;
}) {
  const axis = barAxis(items.flatMap((item) => [item.current, item.previous]));
  // Past three groups the bars get too thin for two labels each: only the current one keeps it.
  const crowded = items.length > CROWDED_GROUPS;
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chart is drawn with HTML and SVG, which an <img> cannot hold; the label carries every number
    <figure role="img" aria-label={describeBars(items, format)}>
      <div className="relative h-48 pt-5">
        <div className="relative h-full">
          <PlotGrid axis={axis} format={format} />
          <div className="absolute inset-y-0 right-0 left-18 flex items-end gap-3">
            {items.map((item) => (
              <div key={item.label} className="flex h-full min-w-0 flex-1 items-end gap-1">
                <Bar
                  value={item.current}
                  axis={axis}
                  format={format}
                  color="var(--chart-brand)"
                  showValue={showValues}
                />
                <Bar
                  value={item.previous}
                  axis={axis}
                  format={format}
                  color="var(--chart-compare)"
                  showValue={showValues && !crowded}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="ml-18 flex gap-3 pt-2">
        {items.map((item) => (
          <span
            key={item.label}
            className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground"
            title={item.label}
          >
            {item.label}
          </span>
        ))}
      </div>
      <Legend />
    </figure>
  );
}

/** How long things took, by band; the median and the 90th percentile are written below. */
export function HistogramChart({
  buckets,
  median,
  percentile90,
  showValues,
}: {
  buckets: readonly ReportBucket[];
  median: string | null;
  percentile90: string | null;
  showValues: boolean;
}) {
  const axis = barAxis(buckets.map((bucket) => bucket.count));
  const label = buckets.map((bucket) => `${bucket.label}: ${bucket.count}`).join("; ");
  const description = `${label}. Mediana ${median ?? "sem dados"}, 90% em até ${percentile90 ?? "sem dados"}`;
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chart is drawn with HTML and SVG, which an <img> cannot hold; the label carries every number
    <figure role="img" aria-label={description}>
      <div className="relative h-44 pt-5">
        <div className="relative h-full">
          <PlotGrid axis={axis} format="count" />
          <div className="absolute inset-y-0 right-0 left-18 flex items-end gap-1.5">
            {buckets.map((bucket) => (
              <Bar
                key={bucket.label}
                value={bucket.count}
                axis={axis}
                format="count"
                color="var(--chart-brand)"
                showValue={showValues}
              />
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="ml-18 flex gap-1.5 pt-2">
        {buckets.map((bucket) => (
          <span
            key={bucket.label}
            className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground"
          >
            {bucket.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-footnote text-muted-foreground">
        Metade em até <strong className="font-semibold text-foreground">{median ?? "—"}</strong> ·
        90% em até <strong className="font-semibold text-foreground">{percentile90 ?? "—"}</strong>
      </p>
    </figure>
  );
}

function SplitRow({ row }: { row: ReportSplitRow }) {
  const total = row.yes + row.no;
  const yesShare = rateOf(row.yes, total) ?? 0;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{row.label}</p>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="bg-chart-brand" style={{ width: `${yesShare * 100}%` }} />
        <span
          className="bg-destructive/70"
          style={{ width: `${total === 0 ? 0 : (1 - yesShare) * 100}%` }}
        />
      </div>
      <p className="flex justify-between gap-3 text-xs tabular-nums">
        <span>
          {row.yesLabel}: <strong className="font-semibold">{row.yes}</strong>{" "}
          <span className="text-muted-foreground">
            ({total === 0 ? "—" : percentFormatter.format(yesShare)})
          </span>
        </span>
        <span className="text-right">
          {row.noLabel}: <strong className="font-semibold">{row.no}</strong>{" "}
          <span className="text-muted-foreground">
            ({total === 0 ? "—" : percentFormatter.format(1 - yesShare)})
          </span>
        </span>
      </p>
    </div>
  );
}

/** Two outcomes (on time / late): one split bar each, numbers and shares on both sides. */
export function SplitChart({ rows }: { rows: readonly ReportSplitRow[] }) {
  const label = rows
    .map((row) => `${row.label}: ${row.yesLabel} ${row.yes}, ${row.noLabel} ${row.no}`)
    .join("; ");
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chart is drawn with HTML and SVG, which an <img> cannot hold; the label carries every number
    <figure role="img" aria-label={label} className="space-y-5">
      {rows.map((row) => (
        <SplitRow key={row.label} row={row} />
      ))}
    </figure>
  );
}

/** The problems of the period, longest bar first, each with its base under the label. */
export function AttentionChart({ items }: { items: readonly ReportAttentionItem[] }) {
  const top = Math.max(1, ...items.map((item) => item.count));
  const label = items.map((item) => `${item.label}: ${item.count} ${item.base}`).join("; ");
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chart is drawn with HTML and SVG, which an <img> cannot hold; the label carries every number
    <figure role="img" aria-label={label} className="grid gap-x-6 gap-y-4 md:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[minmax(0,12rem)_1fr] items-center gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium break-words">{item.label}</p>
            <p className="text-xs text-muted-foreground break-words">{item.base}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-3 rounded-full bg-destructive/70"
              style={{
                width: `${(item.count / top) * 100}%`,
                minWidth: item.count > 0 ? "0.5rem" : 0,
              }}
            />
            <span className="text-sm font-semibold tabular-nums">{item.count}</span>
          </div>
        </div>
      ))}
    </figure>
  );
}
