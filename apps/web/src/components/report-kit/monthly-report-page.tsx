import { reportPeriodLabel, type ReportPeriod } from "@sellbridge/shared/report-period";
import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import type { LinkProps } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink } from "@/components/layout/page-header";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { ServedReport } from "@/features/report-kit/report-model";
import { cn } from "@/lib/utils";
import { DownloadMenu, type DownloadOption } from "./download-menu";
import { IndicatorTable } from "./indicator-table";
import { PeriodControls } from "./period-controls";
import { AttentionChart } from "./bar-charts";
import { ReportCard } from "./report-card";
import { ReportChartsGrid } from "./report-charts";
import { ReportCases, ReportFooter, ReportRules } from "./report-sections";

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function longDate(iso: string): string {
  return longDateFormatter.format(new Date(`${iso}T12:00:00.000Z`));
}

function StatusTag({ period }: { period: ReportPeriod }) {
  const label =
    period.kind === "range"
      ? `${period.days} ${period.days === 1 ? "dia" : "dias"}`
      : period.status === "closed"
        ? "Mês fechado"
        : "Parcial";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        period.status === "closed"
          ? "bg-brand/15 text-brand-text"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export interface ReportQueryState {
  data: ServedReport | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isPlaceholderData: boolean;
  refetch: () => unknown;
  errorMessage: string;
}

interface MonthlyReportPageProps {
  title: string;
  back: { to: NonNullable<LinkProps["to"]>; label: string };
  period: ReportPeriod;
  onPeriodChange: (search: ReportPeriodSearch) => void;
  query: ReportQueryState;
  /** The spreadsheets of this profile; the PDF of the page is added by the page itself. */
  spreadsheets: readonly DownloadOption[];
  generatedBy: string;
  /** The team block (admin); rendered between the cases and the rules. */
  team?: ReactNode;
  teamNames?: { checked: boolean; onChange: (checked: boolean) => void } | undefined;
}

function ReportSkeleton() {
  return (
    <output className="block space-y-4" aria-busy="true" aria-label="Carregando o relatório">
      <Skeleton className="h-72 rounded-3xl" />
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-64 rounded-3xl" />
        ))}
      </div>
    </output>
  );
}

function EmptyReport({ noun, periodLabel }: { noun: string; periodLabel: string }) {
  return (
    <div className="surface-card rounded-3xl bg-card px-6 py-12 text-center">
      <p className="text-subhead font-semibold">
        Nenhum {noun} em {periodLabel}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Escolha outro mês ou um período maior.</p>
    </div>
  );
}

function ReportBody({
  served,
  showValues,
  onShowValuesChange,
  team,
}: {
  served: ServedReport;
  showValues: boolean;
  onShowValuesChange: (show: boolean) => void;
  team: ReactNode;
}) {
  const { report } = served;
  return (
    <>
      <IndicatorTable rows={report.indicators} />
      <div className="flex min-h-11 items-center justify-end gap-2 print:hidden">
        <Switch id="report-show-values" checked={showValues} onCheckedChange={onShowValuesChange} />
        <Label htmlFor="report-show-values">Valores nas barras</Label>
      </div>
      <ReportChartsGrid charts={report.charts} showValues={showValues} />
      {report.attention ? (
        <ReportCard
          title={report.attention.title}
          note="A base de cada problema está embaixo do nome."
        >
          <AttentionChart items={report.attention.items} />
        </ReportCard>
      ) : null}
      <ReportCases tabs={report.cases} />
      {team}
      <ReportRules rules={report.rules} />
    </>
  );
}

/** Back link, title with its status, the period line, the period controls and "Baixar". */
function ReportHeader(props: MonthlyReportPageProps) {
  const { period } = props;
  const pdf: DownloadOption = {
    kind: "pdf",
    label: "Relatório em PDF",
    description: "Esta página pronta para imprimir ou salvar",
    onSelect: () => window.print(),
  };
  return (
    <header className="space-y-3">
      <BackLink to={props.back.to} label={props.back.label} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
            <StatusTag period={period} />
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {longDate(period.fromDate)} a {longDate(period.toDate)} · horário de Brasília
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodControls period={period} onChange={props.onPeriodChange} />
          <DownloadMenu
            periodLabel={reportPeriodLabel(period)}
            options={[pdf, ...props.spreadsheets]}
            teamNames={props.teamNames}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * The monthly report of any profile: header with the month stepper, the period picker and the
 * "Baixar" menu, then the indicators, the charts, the cases and the rules. Printing this page is
 * the PDF: paper colors, no controls, every tab listed and the rules open.
 */
export function MonthlyReportPage(props: MonthlyReportPageProps) {
  const [showValues, setShowValues] = useState(true);
  const { period, query } = props;
  const periodLabel = reportPeriodLabel(period);
  return (
    <div className="space-y-6">
      <p className="hidden border-b border-black pb-2 text-sm font-semibold print:block">
        SellBridge · uso interno
      </p>
      <ReportHeader {...props} />
      {period.status === "partial" && query.data ? (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Período em andamento: números até hoje às{" "}
          {timeFormatter.format(new Date(query.data.generatedAt))}
          {period.kind === "month" ? "; o mês fecha no dia 1º e aí não muda mais." : "."}
        </p>
      ) : null}
      {query.isPending ? <ReportSkeleton /> : null}
      {query.isError ? (
        <ErrorState message={query.errorMessage} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? (
        <div
          aria-busy={query.isPlaceholderData}
          className={cn("space-y-6 transition-opacity", query.isPlaceholderData && "opacity-60")}
        >
          {query.data.report.empty ? (
            <EmptyReport noun={query.data.report.itemNoun} periodLabel={periodLabel} />
          ) : (
            <ReportBody
              served={query.data}
              showValues={showValues}
              onShowValuesChange={setShowValues}
              team={props.team}
            />
          )}
          <ReportFooter
            savedAt={query.data.savedAt}
            generatedAt={query.data.generatedAt}
            generatedBy={props.generatedBy}
          />
        </div>
      ) : null}
    </div>
  );
}
