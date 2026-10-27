import type {
  AgentPerformance,
  SupportOrigin,
  SupportPerformanceReport,
  SupportPeriodDays,
} from "@sellbridge/shared/support-performance";
import { STAFF_ROLE_LABELS } from "@sellbridge/shared/staff-access";
import type {
  SupportMetricsSearch,
  SupportPerformanceChart,
  SupportPerformanceSection,
} from "@sellbridge/shared/schemas";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { FilterTabs } from "@/components/data/filter-tabs";
import { Button } from "@/components/ui/button";
import { periodCaption, tenureText } from "@/features/support/performance-format";
import { boardStory, personStory } from "@/features/support/performance-story";
import { AttentionCard, SubjectsCard, TeamCard } from "./overview-cards";
import { PersonChart } from "./performance-charts";
import { PerformanceChartCard, PersonChartCard } from "./performance-chart-card";
import { PerformanceHero } from "./performance-hero";
import { BoardTiles, PersonTiles } from "./performance-tiles";
import { LowRatingsCard, NowCard, PersonSubjectsCard } from "./person-cards";
import { SubjectsSection } from "./subjects-table";
import { TeamTable } from "./team-table";

export type SearchPatch = Partial<SupportMetricsSearch>;

const SECTION_TABS = [
  { value: "geral", label: "Visão geral" },
  { value: "equipe", label: "Equipe" },
  { value: "assuntos", label: "Assuntos" },
] as const satisfies readonly { value: SupportPerformanceSection; label: string }[];

const PERIOD_TABS = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
] as const satisfies readonly { value: SupportPeriodDays; label: string }[];

const ORIGIN_TABS = [
  { value: "todos", label: "Todos" },
  { value: "revendedor", label: "Revendedores" },
  { value: "fornecedor", label: "Fornecedores" },
] as const satisfies readonly { value: SupportOrigin; label: string }[];

function PeriodFilter({
  search,
  onChange,
}: {
  search: SupportMetricsSearch;
  onChange: (patch: SearchPatch) => void;
}) {
  return (
    <FilterTabs
      legend="Período"
      tabs={PERIOD_TABS}
      value={search.days}
      onChange={(days) => onChange({ days })}
    />
  );
}

function OriginFilter({
  search,
  onChange,
}: {
  search: SupportMetricsSearch;
  onChange: (patch: SearchPatch) => void;
}) {
  return (
    <FilterTabs
      legend="Quem abriu"
      tabs={ORIGIN_TABS}
      value={search.origem}
      onChange={(origem) => onChange({ origem })}
    />
  );
}

interface ViewProps {
  report: SupportPerformanceReport;
  search: SupportMetricsSearch;
  onChange: (patch: SearchPatch) => void;
}

function Filters(props: Omit<ViewProps, "report">) {
  return (
    <>
      <OriginFilter {...props} />
      <PeriodFilter {...props} />
    </>
  );
}

function Overview({ report, search, onChange }: ViewProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <BoardTiles report={report} />
        <PerformanceChartCard
          report={report}
          chart={search.grafico}
          onChartChange={(grafico: SupportPerformanceChart) => onChange({ grafico })}
          filters={<Filters search={search} onChange={onChange} />}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SubjectsCard report={report} />
        <TeamCard report={report} />
        <AttentionCard report={report} />
      </div>
    </>
  );
}

/** The team's screen: the summary, the three sections and the filters each one needs. */
export function BoardView({
  report,
  search,
  onChange,
  download,
}: ViewProps & { download?: ReactNode }) {
  return (
    <>
      <PerformanceHero
        title="Desempenho do suporte"
        caption={periodCaption(report.since, report.until)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <FilterTabs
              legend="Seção"
              tabs={SECTION_TABS}
              value={search.secao}
              onChange={(secao) => onChange({ secao })}
            />
            {download}
          </div>
        }
        story={boardStory(report)}
      />
      {search.secao === "geral" ? (
        <Overview report={report} search={search} onChange={onChange} />
      ) : null}
      {search.secao === "geral" ? null : (
        <div className="flex min-w-0 flex-wrap justify-end gap-2">
          <Filters search={search} onChange={onChange} />
        </div>
      )}
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

function PersonChartSection({
  report,
  search,
  onChange,
  agent,
}: ViewProps & { agent: AgentPerformance }) {
  const firstName = agent.name.split(" ")[0] ?? agent.name;
  return (
    <PersonChartCard
      title={`Resolvidos por ${report.bucket === "day" ? "dia" : "semana"}`}
      filters={<PeriodFilter search={search} onChange={onChange} />}
    >
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
}: ViewProps & { agent: AgentPerformance }) {
  const firstName = agent.name.split(" ")[0] ?? agent.name;
  return (
    <>
      <PerformanceHero
        title={agent.name}
        caption={`${STAFF_ROLE_LABELS[agent.role]} · ${tenureText(agent)} · ${periodCaption(report.since, report.until)}`}
        back={<BackToTeam />}
        action={
          <Button asChild>
            <Link to="/admin/chamados" search={{ queue: "all", responsavel: agent.id }}>
              Ver chamados de {firstName}
            </Link>
          </Button>
        }
        story={personStory(agent)}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <PersonTiles
          agent={agent}
          team={{
            resolvedPerAgent: report.overview.resolvedPerAgent,
            firstResponseMinutes: report.overview.firstResponseMinutes.current,
            rating: report.overview.rating.value,
          }}
        />
        <PersonChartSection report={report} search={search} onChange={onChange} agent={agent} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NowCard agent={agent} now={new Date(report.until)} />
        <PersonSubjectsCard agent={agent} />
        <LowRatingsCard agent={agent} />
      </div>
    </>
  );
}
