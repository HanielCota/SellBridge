import type { SupportPerformanceReport } from "@sellbridge/shared/support-performance";
import { subjectKeyOf } from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import {
  CaretRightIcon,
  ClockCountdownIcon,
  LifebuoyIcon,
  ListPlusIcon,
  TrayIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import { BreakdownSection } from "@/components/reports/breakdown-section";
import { ChecklistDoneIcon } from "@/components/reports/attention-icons";
import {
  ORIGIN_LABELS,
  STANDING_TONE_CLASSES,
  changeCopy,
  formatRating,
  standingCopy,
  subjectLabel,
  topicLabel,
} from "@/features/support/performance-format";
import { attentionCopy, type AttentionTone } from "@/features/support/performance-story";
import { formatPercent } from "@/lib/percent";
import { cn } from "@/lib/utils";

const SUBJECTS_SHOWN = 4;
const count = new Intl.NumberFormat("pt-BR");

function EmptyRows({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

/** The subjects that brought the most tickets: share bar, then topic and how it moved. */
export function SubjectsCard({ report }: { report: SupportPerformanceReport }) {
  const total = report.subjects.reduce((sum, subject) => sum + subject.opened.current, 0);
  // The customer kind only says something when both kinds appear in the list.
  const mixedOrigins = new Set(report.subjects.map((subject) => subject.origin)).size > 1;
  const top = report.subjects
    .filter((subject) => subject.opened.current > 0)
    .slice(0, SUBJECTS_SHOWN);
  return (
    <BreakdownSection
      title="Assuntos que mais geram chamados"
      to="/admin/chamados/metricas"
      search={{ days: report.days, origem: report.origin, secao: "assuntos" }}
      hint="Ver todos os assuntos"
    >
      {top.length === 0 ? (
        <EmptyRows text="Nenhum chamado no período." />
      ) : (
        <ul className="space-y-5">
          {top.map((subject) => {
            const share = total === 0 ? 0 : subject.opened.current / total;
            const change = changeCopy({ ...subject.opened, kind: "count" });
            const difference = subject.opened.current - subject.opened.previous;
            return (
              <li key={subjectKeyOf(subject)} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{subjectLabel(subject)}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {count.format(subject.opened.current)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-chart-brand"
                      style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {formatPercent(share)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {topicLabel(subject.origin, subject.category)}
                  {mixedOrigins ? ` · ${ORIGIN_LABELS[subject.origin]}` : null}
                  {change && change.direction !== "flat" ? (
                    <span className={difference > 0 ? "text-destructive" : "text-brand-text"}>
                      {" "}
                      · {difference > 0 ? "+" : "−"}
                      {count.format(Math.abs(difference))} vs. anterior
                    </span>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </BreakdownSection>
  );
}

/** The team at a glance, the ones who need the coordinator first; no ranking numbers. */
export function TeamCard({ report }: { report: SupportPerformanceReport }) {
  return (
    <BreakdownSection
      title="Equipe"
      to="/admin/chamados/metricas"
      search={{ days: report.days, origem: report.origin, secao: "equipe" }}
      hint="Ver a tabela da equipe"
      wholeCardLinks={false}
    >
      {report.team.length === 0 ? (
        <EmptyRows text="Ninguém na equipe de suporte ainda." />
      ) : (
        <ul className="-mx-2 space-y-1">
          {report.team.map((agent) => {
            const standing = standingCopy(agent);
            return (
              <li key={agent.id}>
                <Link
                  from="/admin/chamados/metricas"
                  to="/admin/chamados/metricas"
                  search={(previous) => ({ ...previous, pessoa: agent.id })}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{agent.name}</span>
                    <span
                      className={cn(
                        "block text-xs font-medium",
                        STANDING_TONE_CLASSES[standing.tone],
                      )}
                    >
                      {standing.text}
                    </span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">
                    <span className="block text-sm font-medium text-foreground">
                      {count.format(agent.resolved.current ?? 0)}
                    </span>
                    nota {formatRating(agent.rating.value)}
                  </span>
                  <CaretRightIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </BreakdownSection>
  );
}

const TONE_CLASSES: Record<AttentionTone, string> = {
  danger: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  review: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const ATTENTION_ICONS = {
  overdue: ClockCountdownIcon,
  rising_subject: TrendUpIcon,
  needs_support: LifebuoyIcon,
  unassigned: TrayIcon,
  open_ended: ListPlusIcon,
} as const;

function AllClear() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
        <ChecklistDoneIcon className="size-6 text-emerald-600 dark:text-emerald-400" />
      </span>
      <p className="max-w-60 text-sm text-muted-foreground">
        <span className="block text-subhead font-medium text-foreground">Tudo em dia</span>
        Nada atrasado, sem responsável ou fora do comum.
      </p>
    </div>
  );
}

/** What only the coordination can act on, most urgent first; the sales dashboard's pattern. */
export function AttentionCard({ report }: { report: SupportPerformanceReport }) {
  return (
    <section
      aria-labelledby="support-attention-title"
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <div className="-my-1 flex h-8 items-center">
        <h2 id="support-attention-title" className="text-subhead font-medium text-muted-foreground">
          Precisa de você
        </h2>
      </div>
      {report.attention.length === 0 ? (
        <AllClear />
      ) : (
        <ul className="-mx-2 mt-4 space-y-1">
          {report.attention.map((item) => {
            const copy = attentionCopy(item, { days: report.days, origin: report.origin });
            const Icon = ATTENTION_ICONS[item.kind];
            return (
              <li key={copy.key}>
                <Link
                  to={copy.link.to}
                  search={copy.link.search}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      TONE_CLASSES[copy.tone],
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium">{copy.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {copy.description}
                    </span>
                  </span>
                  <CaretRightIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
