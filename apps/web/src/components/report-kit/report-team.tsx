import { formatMinutes, formatReportValue } from "@/features/report-kit/report-format";
import { MIN_RATINGS_FOR_AVERAGE, type ReportTeamRow } from "@/features/report-kit/report-model";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ReportCard } from "./report-card";

const perDayFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Output per day worked, so a part-timer is not compared with a full month. */
export function perDay(row: Pick<ReportTeamRow, "total" | "days">): number | null {
  return row.days === 0 ? null : row.total / row.days;
}

function displayName(row: ReportTeamRow, index: number, showNames: boolean): string {
  return showNames ? row.name : `Atendente ${index + 1}`;
}

function rate(value: number | null): string {
  return value === null ? "—" : formatReportValue(value, "rate");
}

function RatingCell({ row }: { row: ReportTeamRow }) {
  if (row.averageRating === null || row.ratings === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex flex-col items-end">
      <span>{formatReportValue(row.averageRating, "rating")}</span>
      <span className="text-xs text-muted-foreground">
        {row.ratings < MIN_RATINGS_FOR_AVERAGE
          ? `Poucas notas (${row.ratings})`
          : `${row.ratings} notas`}
      </span>
    </span>
  );
}

function ProductionBars({
  rows,
  showNames,
}: {
  rows: readonly ReportTeamRow[];
  showNames: boolean;
}) {
  const values = rows.map((row) => perDay(row) ?? 0);
  const top = Math.max(1, ...values);
  const label = rows
    .map(
      (row, index) =>
        `${displayName(row, index, showNames)}: ${perDayFormatter.format(values[index] ?? 0)} por dia em ${row.days} dias`,
    )
    .join("; ");
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chart is drawn with HTML and SVG, which an <img> cannot hold; the label carries every number
    <figure role="img" aria-label={label} className="mb-5 space-y-2">
      {rows.map((row, index) => (
        <div
          key={row.id}
          className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm"
        >
          <span className="truncate">{displayName(row, index, showNames)}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-full bg-chart-brand"
              style={{ width: `${((values[index] ?? 0) / top) * 100}%` }}
            />
            <span className="text-xs whitespace-nowrap tabular-nums">
              {perDayFormatter.format(values[index] ?? 0)}/dia · {row.days}{" "}
              {row.days === 1 ? "dia" : "dias"}
            </span>
          </span>
        </div>
      ))}
    </figure>
  );
}

const HEADERS = [
  { label: "Pessoa", align: "text-left" },
  { label: "Dias", align: "text-right" },
  { label: "Total", align: "text-right" },
  { label: "Por dia", align: "text-right" },
  { label: "Assunto principal", align: "text-left" },
  { label: "Tempo (mediana)", align: "text-right" },
  { label: "No prazo", align: "text-right" },
  { label: "Retrabalho", align: "text-right" },
  { label: "Nota", align: "text-right" },
] as const;

function TeamTable({ rows, showNames }: { rows: readonly ReportTeamRow[]; showNames: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[46rem] text-sm tabular-nums">
        <caption className="sr-only">Produção da equipe no período</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            {HEADERS.map((header) => (
              <th
                key={header.label}
                scope="col"
                className={`px-2 py-2 font-normal first:pl-0 last:pr-0 ${header.align}`}
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="border-t border-border">
              <th scope="row" className="py-3 pr-2 text-left font-medium">
                {displayName(row, index, showNames)}
              </th>
              <td className="px-2 py-3 text-right">{row.days}</td>
              <td className="px-2 py-3 text-right">{row.total}</td>
              <td className="px-2 py-3 text-right">{perDayFormatter.format(perDay(row) ?? 0)}</td>
              <td className="px-2 py-3">{row.topCategory ?? "—"}</td>
              <td className="px-2 py-3 text-right">
                {row.medianMinutes === null ? "—" : formatMinutes(row.medianMinutes)}
              </td>
              <td className="px-2 py-3 text-right">{rate(row.onTimeRate)}</td>
              <td className="px-2 py-3 text-right">{rate(row.reworkRate)}</td>
              <td className="py-3 pl-2 text-right">
                <RatingCell row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The team: production per day worked and a fair table; names can be hidden for sharing. */
export function ReportTeam({
  rows,
  showNames,
  onShowNamesChange,
  creditRule,
}: {
  rows: readonly ReportTeamRow[];
  showNames: boolean;
  onShowNamesChange: (show: boolean) => void;
  /** Who gets the credit for a ticket, in one sentence; the full rules are in "Como contamos". */
  creditRule: string;
}) {
  return (
    <ReportCard
      title="Equipe"
      note={`Produção por dia trabalhado. ${creditRule}`}
      actions={
        <div className="flex min-h-11 items-center gap-2 print:hidden">
          <Switch id="report-show-names" checked={showNames} onCheckedChange={onShowNamesChange} />
          <Label htmlFor="report-show-names">Mostrar nomes</Label>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém da equipe atuou neste período.</p>
      ) : (
        <>
          <ProductionBars rows={rows} showNames={showNames} />
          <TeamTable rows={rows} showNames={showNames} />
        </>
      )}
    </ReportCard>
  );
}
