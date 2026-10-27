import type { SupportPerformanceReport } from "@sellbridge/shared/support-performance";
import type { SupportPerformanceChart } from "@sellbridge/shared/schemas";
import { useState, type ReactNode } from "react";
import { FilterTabs } from "@/components/data/filter-tabs";
import { HoursHeatmap } from "./hours-heatmap";
import { ResponseChart, VolumeChart, type VolumeSeries } from "./performance-charts";

const CHART_TABS = [
  { value: "volume", label: "Volume" },
  { value: "resposta", label: "1ª resposta" },
  { value: "horarios", label: "Horários" },
] as const satisfies readonly { value: SupportPerformanceChart; label: string }[];

const CHART_TITLES: Record<SupportPerformanceChart, string> = {
  volume: "Chamados que entraram e foram resolvidos",
  resposta: "Primeira resposta ao longo do período",
  horarios: "Quando os chamados chegam",
};

const SERIES = [
  { key: "both", label: "Tudo", color: null },
  { key: "resolved", label: "Resolvidos", color: "var(--chart-brand)" },
  { key: "opened", label: "Entraram", color: "var(--muted-foreground)" },
] as const satisfies readonly { key: VolumeSeries; label: string; color: string | null }[];

/** The pills double as the legend, like the sales chart's: each carries its series' dot. */
function SeriesPills({
  value,
  onChange,
}: {
  value: VolumeSeries;
  onChange: (next: VolumeSeries) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-1 sm:gap-1.5">
      <legend className="sr-only">Séries do gráfico</legend>
      {SERIES.map((series) => (
        <label
          key={series.key}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground has-checked:border-foreground has-checked:bg-foreground has-checked:font-medium has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring/40 sm:px-4"
        >
          <input
            type="radio"
            name="support-volume-series"
            value={series.key}
            checked={series.key === value}
            onChange={() => onChange(series.key)}
            className="sr-only"
          />
          {series.color ? (
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: series.color }}
            />
          ) : null}
          {series.label}
        </label>
      ))}
    </fieldset>
  );
}

function ResponseLegend() {
  return (
    <ul className="flex h-10 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-chart-brand" />
        Primeira resposta (mediana)
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-0 w-3 border-t-2 border-dashed border-destructive" />
        Prazo do urgente
      </li>
    </ul>
  );
}

function ChartBody({
  chart,
  report,
  series,
}: {
  chart: SupportPerformanceChart;
  report: SupportPerformanceReport;
  series: VolumeSeries;
}) {
  if (chart === "horarios") {
    return <HoursHeatmap cells={report.heatmap} />;
  }
  return (
    // Nothing drawn may leave the figure, not even for a frame while the card resizes.
    <figure
      aria-label={`Gráfico: ${CHART_TITLES[chart].toLowerCase()}`}
      className="relative min-h-72 flex-1 overflow-hidden"
    >
      {chart === "volume" ? (
        <VolumeChart report={report} series={series} />
      ) : (
        <ResponseChart report={report} />
      )}
    </figure>
  );
}

/** The big chart card of the overview: three views of the period, filters in its header. */
export function PerformanceChartCard({
  report,
  chart,
  onChartChange,
  filters,
}: {
  report: SupportPerformanceReport;
  chart: SupportPerformanceChart;
  onChartChange: (next: SupportPerformanceChart) => void;
  filters: ReactNode;
}) {
  const [series, setSeries] = useState<VolumeSeries>("both");
  return (
    <section
      aria-labelledby="support-chart-title"
      className="surface-card flex h-full min-w-0 flex-col gap-5 rounded-3xl bg-card p-5"
    >
      <h2 id="support-chart-title" className="sr-only">
        {CHART_TITLES[chart]}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs legend="Gráfico" tabs={CHART_TABS} value={chart} onChange={onChartChange} />
        <div className="flex max-w-full min-w-0 flex-wrap gap-2">{filters}</div>
      </div>
      {chart === "volume" ? <SeriesPills value={series} onChange={setSeries} /> : null}
      {chart === "resposta" ? <ResponseLegend /> : null}
      <ChartBody chart={chart} report={report} series={series} />
    </section>
  );
}

/** The same card frame for a person's sheet: their line against the team's. */
export function PersonChartCard({
  title,
  filters,
  children,
}: {
  title: string;
  filters: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby="person-chart-title"
      className="surface-card flex h-full min-w-0 flex-col gap-5 rounded-3xl bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="person-chart-title" className="text-subhead font-medium text-muted-foreground">
          {title}
        </h2>
        <div className="flex max-w-full min-w-0 flex-wrap gap-2">{filters}</div>
      </div>
      {children}
    </section>
  );
}
