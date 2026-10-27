import type {
  AgentPerformance,
  SubjectPerformance,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { subjectKeyOf } from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import { CaretRightIcon } from "@phosphor-icons/react";
import { HintedText } from "@/components/ui/hint";
import {
  ORIGIN_LABELS,
  STANDING_TONE_CLASSES,
  periodSearch,
  standingCopy,
  subjectLabel,
  topicLabel,
} from "@/features/support/performance-format";
import {
  nowLine,
  standingReason,
  subjectTrend,
  type SubjectTrend,
} from "@/features/support/performance-people";
import { initials } from "@/lib/initials";
import { formatPercent } from "@/lib/percent";
import { cn } from "@/lib/utils";
import { CARD_ROWS, type MoreLink, OverviewCard } from "./overview-card";

const count = new Intl.NumberFormat("pt-BR");

function EmptyRows({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function SubjectRow({
  subject,
  share,
  mixedOrigins,
}: {
  subject: SubjectPerformance;
  share: number;
  mixedOrigins: boolean;
}) {
  const trend = subjectTrend(subject.opened);
  return (
    <li className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{subjectLabel(subject)}</span>
            {trend.rising ? (
              <HintedText
                label="Pelo menos 3 chamados a mais e 50% acima do período anterior"
                className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-caption font-semibold text-destructive"
              >
                Disparou
              </HintedText>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {topicLabel(subject.origin, subject.category)}
            {mixedOrigins ? ` · ${ORIGIN_LABELS[subject.origin]}` : null}
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="block text-base font-semibold">
            {count.format(subject.opened.current)}
          </span>
          <span className={cn("block text-xs font-medium", TREND_TONES[trend.tone])}>
            {trend.text}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-chart-brand"
            style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
          />
        </div>
        <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {formatPercent(share)} do total
        </span>
      </div>
    </li>
  );
}

const TREND_TONES: Record<SubjectTrend["tone"], string> = {
  up: "text-destructive",
  down: "text-brand-text",
  flat: "text-muted-foreground",
};

/** The subjects that brought the most tickets: share bar, then topic and how it moved. */
export function SubjectsCard({ report }: { report: SupportPerformanceReport }) {
  const total = report.subjects.reduce((sum, subject) => sum + subject.opened.current, 0);
  // The customer kind only says something when both kinds appear in the list.
  const mixedOrigins = new Set(report.subjects.map((subject) => subject.origin)).size > 1;
  const withTickets = report.subjects.filter((subject) => subject.opened.current > 0);
  const top = withTickets.slice(0, CARD_ROWS);
  const more: MoreLink | null =
    withTickets.length > CARD_ROWS
      ? {
          label: `Ver os ${count.format(withTickets.length)} assuntos`,
          to: "/admin/chamados/metricas",
          search: { ...periodSearch(report.period), origem: report.origin, secao: "assuntos" },
        }
      : null;
  return (
    <OverviewCard id="support-subjects-title" title="Assuntos que mais geram chamados" more={more}>
      {top.length === 0 ? (
        <EmptyRows text="Nenhum chamado no período." />
      ) : (
        <ul className="space-y-5">
          {top.map((subject) => (
            <SubjectRow
              key={subjectKeyOf(subject)}
              subject={subject}
              share={total === 0 ? 0 : subject.opened.current / total}
              mixedOrigins={mixedOrigins}
            />
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

function TeamRow({ agent }: { agent: AgentPerformance }) {
  const standing = standingCopy(agent);
  return (
    <li>
      <Link
        from="/admin/chamados/metricas"
        to="/admin/chamados/metricas"
        search={(previous) => ({ ...previous, pessoa: agent.id })}
        className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-caption font-semibold"
        >
          {initials(agent.name)}
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{agent.name}</span>
            <span
              className={cn("shrink-0 text-xs font-medium", STANDING_TONE_CLASSES[standing.tone])}
            >
              {standing.text}
            </span>
          </span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            {standingReason(agent)}
          </span>
          <span className="block text-xs text-muted-foreground tabular-nums">{nowLine(agent)}</span>
        </span>
        <CaretRightIcon className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** The team at a glance, the ones who need the coordinator first; no ranking numbers. */
export function TeamCard({ report }: { report: SupportPerformanceReport }) {
  const more: MoreLink | null =
    report.team.length > CARD_ROWS
      ? {
          label: `Ver as ${count.format(report.team.length)} pessoas da equipe`,
          to: "/admin/chamados/metricas",
          search: { ...periodSearch(report.period), origem: report.origin, secao: "equipe" },
        }
      : null;
  return (
    <OverviewCard id="support-team-title" title="Equipe" more={more}>
      {report.team.length === 0 ? (
        <EmptyRows text="Ninguém na equipe de suporte ainda." />
      ) : (
        <ul className="-mx-2 space-y-1">
          {report.team.slice(0, CARD_ROWS).map((agent) => (
            <TeamRow key={agent.id} agent={agent} />
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
