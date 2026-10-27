import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from "@phosphor-icons/react";
import {
  formatReportValue,
  reportChange,
  targetLabel,
  targetStatus,
  type ChangeTone,
} from "@/features/report-kit/report-format";
import type { ReportIndicatorRow, ReportMetricRow } from "@/features/report-kit/report-model";
import { cn } from "@/lib/utils";
import { ReportCard } from "./report-card";

const TONE_CLASSES: Record<ChangeTone, string> = {
  good: "text-brand-text",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
};
const TONE_WORDS: Record<ChangeTone, string> = {
  good: "melhorou",
  bad: "piorou",
  neutral: "variou",
};
const ARROWS = { up: ArrowUpIcon, down: ArrowDownIcon, flat: ArrowRightIcon } as const;

/** The value that is compared: the rate when there is one, else the count. */
function headline(row: ReportMetricRow): {
  value: number | null;
  format: ReportMetricRow["rateFormat"];
} {
  if (row.rate !== null) {
    return { value: row.rate, format: row.rateFormat };
  }
  return { value: row.count, format: row.countFormat };
}

function ChangeCell({ row }: { row: ReportMetricRow }) {
  const { value, format } = headline(row);
  const change = reportChange(value, row.previous, format, row.sense);
  if (change === null || row.previous === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const Arrow = ARROWS[change.direction];
  return (
    <span className="flex flex-col items-end">
      <span className={cn("inline-flex items-center gap-1 font-medium", TONE_CLASSES[change.tone])}>
        <Arrow className="size-3" weight="bold" aria-hidden="true" />
        <span className="sr-only">{TONE_WORDS[change.tone]}:</span>
        {change.amount}
      </span>
      <span className="text-xs text-muted-foreground">
        antes {formatReportValue(row.previous, format)}
      </span>
    </span>
  );
}

function TargetCell({ row }: { row: ReportMetricRow }) {
  if (row.target === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const status = targetStatus(headline(row).value, row.target);
  return (
    <span className="flex flex-col items-end">
      <span>{targetLabel(row.target, row.rateFormat)}</span>
      {status ? (
        <span className={cn("text-xs", status.met ? "text-brand-text" : "text-destructive")}>
          {status.label}
        </span>
      ) : null}
    </span>
  );
}

function MetricRow({ row }: { row: ReportMetricRow }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className={cn("py-3 pr-4 text-left font-normal", row.indent && "pl-5")}>
        <span className="block font-medium">{row.label}</span>
        {row.base ? <span className="block text-xs text-muted-foreground">{row.base}</span> : null}
      </th>
      <td className="px-3 py-3 text-right">
        {row.count === null ? "—" : formatReportValue(row.count, row.countFormat)}
      </td>
      <td className="px-3 py-3 text-right font-medium">
        {row.rate === null ? "—" : formatReportValue(row.rate, row.rateFormat)}
      </td>
      <td className="px-3 py-3 text-right">
        <TargetCell row={row} />
      </td>
      <td className="py-3 pl-3 text-right">
        <ChangeCell row={row} />
      </td>
    </tr>
  );
}

function GroupRow({ label, note }: { label: string; note: string | null }) {
  return (
    <tr className="border-t border-border bg-muted/60">
      <th scope="colgroup" colSpan={5} className="px-3 py-2 text-left text-xs font-semibold">
        {label}
        {note ? <span className="font-normal text-muted-foreground"> · {note}</span> : null}
      </th>
    </tr>
  );
}

/** Indicador | Nº | Taxa | Meta | vs. período anterior, with group rows and indented parts. */
export function IndicatorTable({ rows }: { rows: readonly ReportIndicatorRow[] }) {
  return (
    <ReportCard title="Indicadores" note="Cada taxa diz sobre o quê foi calculada.">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[40rem] text-sm tabular-nums">
          <caption className="sr-only">Indicadores do período com meta e comparação</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="py-3 pr-4 text-left font-normal">
                Indicador
              </th>
              <th scope="col" className="px-3 py-3 text-right font-normal">
                Nº
              </th>
              <th scope="col" className="px-3 py-3 text-right font-normal">
                Taxa
              </th>
              <th scope="col" className="px-3 py-3 text-right font-normal">
                Meta
              </th>
              <th scope="col" className="py-3 pl-3 text-right font-normal">
                vs. período anterior
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) =>
              row.kind === "group" ? (
                <GroupRow key={`group-${index}`} label={row.label} note={row.note} />
              ) : (
                <MetricRow key={`${row.label}-${index}`} row={row} />
              ),
            )}
          </tbody>
        </table>
      </div>
    </ReportCard>
  );
}
