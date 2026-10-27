import type { SupportPerformanceReport } from "@sellbridge/shared/support-performance";
import type { SupportPerformanceChart } from "@sellbridge/shared/schemas";
import { useState, type ReactNode } from "react";
import { FilterTabs } from "@/components/data/filter-tabs";
import {
  KINDS_WITH_SERIES,
  kindHeadline,
  SUPPORT_CHART_COPY,
  useDefaultSupportChart,
  type SupportChartKind,
} from "@/features/support/support-chart-kinds";
import { cn } from "@/lib/utils";
import { HoursHeatmap } from "./hours-heatmap";
import { SupportChartKindMenu } from "./support-chart-kind-menu";
import { VolumeKindChart, type VolumeSeries } from "./volume-charts";

const CHART_TABS = [
  { value: "volume", label: "Volume" },
  { value: "horarios", label: "Horários" },
] as const satisfies readonly { value: SupportPerformanceChart; label: string }[];

const SERIES = [
  { key: "both", label: "Tudo", color: null },
  { key: "resolved", label: "Resolvidos", color: "var(--chart-brand)" },
  { key: "opened", label: "Entraram", color: "var(--muted-foreground)" },
] as const satisfies readonly { key: VolumeSeries; label: string; color: string | null }[];

const CAPTIONS: Partial<Record<SupportChartKind, string>> = {
  balance: "Vermelho: a fila cresceu. Verde: a equipe resolveu mais do que entrou.",
  rate: "Linha tracejada: 100%, quando sai o mesmo tanto que entra.",
};

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

function Headline({ report, kind }: { report: SupportPerformanceReport; kind: SupportChartKind }) {
  const headline = kindHeadline(report, kind);
  return (
    <div className="space-y-1.5">
      <h2 id="support-chart-title" className="text-subhead font-medium text-muted-foreground">
        {SUPPORT_CHART_COPY[kind].title}
      </h2>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span
          className={cn(
            "text-3xl font-semibold tracking-tight tabular-nums",
            headline.tone === "bad" && "text-destructive",
            headline.tone === "good" && "text-brand-text",
          )}
        >
          {headline.value}
        </span>
        {headline.change === null ? null : (
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              headline.changeGood === true && "text-brand-text",
              headline.changeGood === false && "text-destructive",
              headline.changeGood === null && "text-muted-foreground",
            )}
          >
            {headline.change}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{headline.note}</span>
      </p>
    </div>
  );
}

/** The kind on screen: the one picked here, or else the default saved in this browser. */
function useChartKind() {
  const { defaultKind, setDefaultKind } = useDefaultSupportChart();
  const [picked, setPicked] = useState<SupportChartKind | null>(null);
  return { kind: picked ?? defaultKind, defaultKind, setPicked, setDefaultKind };
}

function VolumeView({ report }: { report: SupportPerformanceReport }) {
  const { kind, defaultKind, setPicked, setDefaultKind } = useChartKind();
  const [series, setSeries] = useState<VolumeSeries>("both");
  const [compare, setCompare] = useState(false);
  const caption = CAPTIONS[kind];
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <Headline report={report} kind={kind} />
        <SupportChartKindMenu
          kind={kind}
          defaultKind={defaultKind}
          compare={compare}
          onKindChange={setPicked}
          onSetDefault={setDefaultKind}
          onCompareChange={setCompare}
        />
      </div>
      {KINDS_WITH_SERIES.has(kind) ? <SeriesPills value={series} onChange={setSeries} /> : null}
      {caption === undefined ? null : (
        <p className="flex min-h-10 items-center text-sm text-muted-foreground">{caption}</p>
      )}
      {/* Nothing drawn may leave the figure, not even for a frame while the card resizes. */}
      <figure
        aria-label={`Gráfico: ${SUPPORT_CHART_COPY[kind].title.toLowerCase()}`}
        className="relative min-h-72 flex-1 overflow-hidden"
      >
        <VolumeKindChart report={report} kind={kind} series={series} compare={compare} />
      </figure>
    </>
  );
}

/** The main chart card of the overview: volume in five kinds, or when tickets arrive. */
export function PerformanceChartCard({
  report,
  chart,
  onChartChange,
}: {
  report: SupportPerformanceReport;
  chart: SupportPerformanceChart;
  onChartChange: (next: SupportPerformanceChart) => void;
}) {
  return (
    <section
      aria-labelledby="support-chart-title"
      className="surface-card flex min-w-0 flex-col gap-5 rounded-3xl bg-card p-5"
    >
      <FilterTabs legend="Gráfico" tabs={CHART_TABS} value={chart} onChange={onChartChange} />
      {chart === "horarios" ? <HoursHeatmap report={report} /> : <VolumeView report={report} />}
    </section>
  );
}

/** The same card frame for a person's sheet: their line against the team's. */
export function PersonChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby="person-chart-title"
      className="surface-card flex h-full min-w-0 flex-col gap-5 rounded-3xl bg-card p-5"
    >
      <h2 id="person-chart-title" className="text-subhead font-medium text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
