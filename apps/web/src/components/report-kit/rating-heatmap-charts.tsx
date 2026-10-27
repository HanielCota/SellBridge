import { formatReportValue } from "@/features/report-kit/report-format";
import type { ReportHeatmap } from "@/features/report-kit/report-model";

/** 5 and 4 stars in the brand, 3 neutral, 2 and 1 in the alert color (they are the problems). */
const STAR_COLORS: Record<number, string> = {
  5: "var(--chart-brand)",
  4: "color-mix(in oklch, var(--chart-brand) 55%, var(--card))",
  3: "color-mix(in oklch, var(--muted-foreground) 45%, var(--card))",
  2: "color-mix(in oklch, var(--destructive) 55%, var(--card))",
  1: "var(--destructive)",
};
const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function segments(counts: readonly { stars: number; count: number }[]) {
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  return counts.reduce<{
    offset: number;
    items: { stars: number; length: number; offset: number }[];
  }>(
    (state, item) => {
      const length = total === 0 ? 0 : (item.count / total) * CIRCUMFERENCE;
      return {
        offset: state.offset + length,
        items: [...state.items, { stars: item.stars, length, offset: state.offset }],
      };
    },
    { offset: 0, items: [] },
  ).items;
}

/** Ratings as a ring with the average in the middle and how many of each in the legend. */
export function RatingChart({
  average,
  counts,
}: {
  average: number | null;
  counts: readonly { stars: number; count: number }[];
}) {
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const label = `${total} notas, média ${average === null ? "sem dados" : formatReportValue(average, "rating")}. ${counts
    .map((item) => `${item.stars} ${item.stars === 1 ? "estrela" : "estrelas"}: ${item.count}`)
    .join("; ")}`;
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chart is drawn with HTML and SVG, which an <img> cannot hold; the label carries every number
    <figure role="img" aria-label={label} className="flex flex-wrap items-center gap-6">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth="12" />
          {segments(counts).map((segment) => (
            <circle
              key={segment.stars}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={STAR_COLORS[segment.stars]}
              strokeWidth="12"
              strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
              strokeDashoffset={-segment.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">
            {average === null ? "—" : formatReportValue(average, "rating")}
          </span>
          <span className="text-xs text-muted-foreground">
            {total === 1 ? "1 nota" : `${total} notas`}
          </span>
        </div>
      </div>
      <ul className="min-w-32 flex-1 space-y-1.5 text-sm tabular-nums">
        {counts.map((item) => (
          <li key={item.stars} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: STAR_COLORS[item.stars] }}
              aria-hidden="true"
            />
            <span>
              {item.stars} {item.stars === 1 ? "estrela" : "estrelas"}
            </span>
            <span className="ml-auto font-medium">{item.count}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Weekday × time band, with the number inside every cell; it is a real table. */
export function HeatmapChart({ heatmap }: { heatmap: ReportHeatmap }) {
  const top = Math.max(1, ...heatmap.cells.flat());
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[22rem] border-separate border-spacing-1 text-xs tabular-nums">
        <caption className="sr-only">
          {heatmap.title}, em {heatmap.unit}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Dia</span>
            </th>
            {heatmap.columnLabels.map((column) => (
              <th key={column} scope="col" className="pb-1 font-normal text-muted-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.rowLabels.map((row, rowIndex) => (
            <tr key={row}>
              <th scope="row" className="pr-1 text-left font-normal text-muted-foreground">
                {row}
              </th>
              {heatmap.columnLabels.map((column, columnIndex) => {
                const count = heatmap.cells[rowIndex]?.[columnIndex] ?? 0;
                const strength = Math.round((count / top) * 100);
                return (
                  <td
                    key={column}
                    className="h-8 rounded-md text-center font-medium"
                    style={{
                      backgroundColor: `color-mix(in oklch, var(--chart-brand) ${strength}%, var(--muted))`,
                      // Dark ink only on the strongest cells; mid tones keep the page's text color (4.5:1).
                      color: strength > 75 ? "var(--brand-ink)" : "var(--foreground)",
                    }}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
