import type {
  AgentPerformance,
  HealthMetricKey,
  SupportOrigin,
  SupportPerformanceReport,
  SupportPeriodPreset,
} from "@sellbridge/shared/support-performance";
import { STAFF_ROLE_LABELS } from "@sellbridge/shared/staff-access";
import type {
  SupportMetricsSearch,
  SupportPerformanceChart,
  SupportPerformanceSection,
} from "@sellbridge/shared/schemas";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { FilterTabs } from "@/components/data/filter-tabs";
import { PeriodFilters } from "@/components/reports/period-filters";
import { periodCaption, tenureText } from "@/features/support/performance-format";
import { boardStory, personStory } from "@/features/support/performance-story";
import { AttentionCard } from "./attention-card";
import { HealthDrillDown } from "./health-drill-down";
import { HealthMetricTiles } from "./health-metric-tiles";
import { SubjectsCard, TeamCard } from "./overview-cards";
import { PersonActionsMenu } from "./person-actions-menu";
import { PersonChart } from "./performance-charts";
import { PerformanceChartCard, PersonChartCard } from "./performance-chart-card";
import { PerformanceHero } from "./performance-hero";
import { PersonTiles } from "./performance-tiles";
import { LowRatingsCard, NowCard, PersonSubjectsCard } from "./person-cards";
import { SubjectsSection } from "./subjects-table";
import { SupportHealthCard } from "./support-health-card";
import { TeamTable } from "./team-table";
import { TodayPanel } from "./today-panel";

export type SearchPatch = Partial<SupportMetricsSearch>;

const SECTION_TABS = [
  { value: "geral", label: "Visão geral" },
  { value: "equipe", label: "Equipe" },
  { value: "assuntos", label: "Assuntos" },
] as const satisfies readonly { value: SupportPerformanceSection; label: string }[];

const ORIGIN_TABS = [
  { value: "todos", label: "Todos" },
  { value: "revendedor", label: "Revendedores" },
  { value: "fornecedor", label: "Fornecedores" },
] as const satisfies readonly { value: SupportOrigin; label: string }[];

/** The reports' periods this screen offers, in the same order as the sales dashboard. */
const PERIOD_PRESETS: readonly SupportPeriodPreset[] = ["today", "7d", "30d", "90d", "custom"];

interface ViewProps {
  report: SupportPerformanceReport;
  search: SupportMetricsSearch;
  onChange: (patch: SearchPatch) => void;
}

/** The period of the whole page: the reports' segments and calendar, the same as everywhere. */
function PeriodControl({ report, search, onChange }: ViewProps) {
  return (
    <PeriodFilters
      search={search}
      presets={PERIOD_PRESETS}
      resolvedFrom={report.period.fromDate}
      resolvedTo={report.period.toDate}
      onChange={(patch) => onChange({ ...patch, pessoa: search.pessoa })}
    />
  );
}

/**
 * One row of controls under the summary: the sections on the left, and on the right the
 * filters that change the whole page, so they are not taken for a chart's own controls.
 */
function Toolbar({ report, search, onChange }: ViewProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <FilterTabs
        legend="Seção"
        tabs={SECTION_TABS}
        value={search.secao}
        onChange={(secao) => onChange({ secao })}
      />
      <div className="flex max-w-full min-w-0 flex-wrap items-start gap-2">
        <FilterTabs
          legend="Quem abriu"
          tabs={ORIGIN_TABS}
          value={search.origem}
          onChange={(origem) => onChange({ origem })}
        />
        <PeriodControl report={report} search={search} onChange={onChange} />
      </div>
    </div>
  );
}

function scrollToChart() {
  document
    .getElementById("support-chart-title")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function HealthSection({ report, search, onChange }: ViewProps) {
  const metric =
    report.health.metrics.find((item) => item.key === search.metrica) ?? report.health.metrics[0];
  const selectMetric = (metrica: HealthMetricKey) => onChange({ metrica });
  return (
    <>
      <SupportHealthCard
        report={report}
        onSelectMetric={selectMetric}
        onShowHours={() => {
          onChange({ grafico: "horarios" });
          scrollToChart();
        }}
      />
      {metric === undefined ? null : (
        <>
          <HealthMetricTiles
            metrics={report.health.metrics}
            selected={metric.key}
            onSelect={selectMetric}
          />
          <HealthDrillDown metric={metric} report={report} />
        </>
      )}
    </>
  );
}

/** The overview in the agreed order: the chart, the day, the health, then the three cards. */
function Overview({ report, search, onChange }: ViewProps) {
  return (
    <>
      <PerformanceChartCard
        report={report}
        chart={search.grafico}
        onChartChange={(grafico: SupportPerformanceChart) => onChange({ grafico })}
      />
      {report.today === null ? null : <TodayPanel report={report} today={report.today} />}
      <HealthSection report={report} search={search} onChange={onChange} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SubjectsCard report={report} />
        <TeamCard report={report} />
        <AttentionCard report={report} />
      </div>
    </>
  );
}

/** The team's screen: the summary, the sections and the page-wide filters. */
export function BoardView({ report, search, onChange }: ViewProps) {
  return (
    <>
      <PerformanceHero
        title="Desempenho do suporte"
        caption={periodCaption(report.period)}
        story={boardStory(report)}
      />
      <Toolbar report={report} search={search} onChange={onChange} />
      {search.secao === "geral" ? (
        <Overview report={report} search={search} onChange={onChange} />
      ) : null}
      {search.secao === "equipe" ? <TeamTable report={report} /> : null}
      {search.secao === "assuntos" ? <SubjectsSection report={report} /> : null}
    </>
  );
}

function BackToTeam() {
  return (
    <Link
      from="/admin/chamados/metricas"
      to="/admin/chamados/metricas"
      search={(previous) => ({ ...previous, pessoa: undefined, secao: "equipe" })}
      className="-ml-1 inline-flex items-center gap-1.5 rounded-full px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      Equipe
    </Link>
  );
}

const BUCKET_WORDS = { hour: "hora", day: "dia", week: "semana" } as const;

function PersonChartSection({
  report,
  agent,
}: {
  report: SupportPerformanceReport;
  agent: AgentPerformance;
}) {
  const firstName = agent.name.split(" ")[0] ?? agent.name;
  return (
    <PersonChartCard title={`Resolvidos por ${BUCKET_WORDS[report.bucket]}`}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-full bg-chart-brand" />
          {firstName}
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-0 w-3 border-t-2 border-dashed border-muted-foreground"
          />
          Média da equipe
        </li>
      </ul>
      <figure
        aria-label={`Gráfico: resolvidos por ${firstName} e média da equipe`}
        className="relative min-h-72 flex-1 overflow-hidden"
      >
        <PersonChart report={report} resolvedSeries={agent.resolvedSeries} name={firstName} />
      </figure>
    </PersonChartCard>
  );
}

/** One team member's sheet: the same layout, every figure set against the team. */
export function PersonView({
  report,
  search,
  onChange,
  agent,
  canReassign,
}: ViewProps & { agent: AgentPerformance; canReassign: boolean }) {
  return (
    <>
      <PerformanceHero
        title={agent.name}
        caption={`${STAFF_ROLE_LABELS[agent.role]} · ${tenureText(agent)} · ${periodCaption(report.period)}`}
        back={<BackToTeam />}
        action={<PersonActionsMenu report={report} agent={agent} canReassign={canReassign} />}
        story={personStory(agent)}
      />
      <div className="flex justify-end">
        <PeriodControl report={report} search={search} onChange={onChange} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <PersonTiles
          agent={agent}
          team={{
            resolvedPerAgent: report.overview.resolvedPerAgent,
            firstResponseMinutes: report.overview.firstResponseMinutes.current,
            rating: report.overview.rating.value,
          }}
        />
        <PersonChartSection report={report} agent={agent} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NowCard agent={agent} now={new Date(report.until)} />
        <PersonSubjectsCard agent={agent} />
        <LowRatingsCard agent={agent} />
      </div>
    </>
  );
}
