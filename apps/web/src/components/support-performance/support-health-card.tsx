import type {
  HealthLevel,
  HealthMetricKey,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import { CaretRightIcon, CheckIcon, StarIcon, WarningIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { HintedText } from "@/components/ui/hint";
import {
  healthActions,
  healthHistory,
  type HealthAction,
} from "@/features/support/performance-actions";
import { periodWhen } from "@/features/support/performance-format";
import {
  formatHealthValue,
  HEALTH_LEVEL_LABELS,
  HEALTH_METRIC_LABELS,
} from "@/features/support/performance-health";
import { cn } from "@/lib/utils";

/*
 * The health card, adapted from the supplier's Desempenho: on the left how the support stands
 * (one bar per target, the last weeks); on the right what turns it green again, most urgent first.
 */

const LEVEL_TEXT: Record<HealthLevel, string> = {
  off_target: "text-destructive",
  warning: "text-amber-700 dark:text-amber-300",
  on_target: "text-brand-text",
  insufficient: "text-muted-foreground",
};

const LEVEL_BAR: Record<HealthLevel, string> = {
  off_target: "bg-destructive",
  warning: "bg-amber-500",
  on_target: "bg-chart-brand",
  insufficient: "bg-muted-foreground/30",
};

const LEVEL_ICON_SURFACE: Record<HealthLevel, string> = {
  off_target: "bg-destructive/12 text-destructive",
  warning: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  on_target: "bg-chart-brand/14 text-brand-text",
  insufficient: "bg-muted text-muted-foreground",
};

const count = new Intl.NumberFormat("pt-BR");

function LevelIcon({ level }: { level: HealthLevel }) {
  const Icon = level === "on_target" ? CheckIcon : WarningIcon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full",
        LEVEL_ICON_SURFACE[level],
      )}
    >
      <Icon className="size-6" weight="bold" />
    </span>
  );
}

function TargetBars({ report }: { report: SupportPerformanceReport }) {
  return (
    <ul className="grid grid-cols-4 gap-1" aria-label="Situação de cada meta">
      {report.health.metrics.map((metric) => (
        <li key={metric.key} className="min-w-0 space-y-1.5">
          <span className={cn("block h-2 rounded-full", LEVEL_BAR[metric.level])} />
          <span className="block truncate text-caption text-muted-foreground">
            {HEALTH_METRIC_LABELS[metric.key]}
            <span className="sr-only">: {HEALTH_LEVEL_LABELS[metric.level]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function History({ report }: { report: SupportPerformanceReport }) {
  const history = healthHistory(report);
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">Últimos {history.steps.length} períodos</p>
      <ol className="grid grid-cols-5 gap-1">
        {history.steps.map((step) => (
          <li key={step.title} title={step.title} className="flex flex-col items-center gap-1">
            <span className={cn("block h-2 w-full rounded-full", LEVEL_BAR[step.level])} />
            <span className="text-caption text-muted-foreground tabular-nums">{step.label}</span>
            <span className="sr-only">{step.title}</span>
          </li>
        ))}
      </ol>
      <p
        className={cn(
          "text-xs font-medium",
          history.worse ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {history.text}
      </p>
    </div>
  );
}

function HowWeStand({ report }: { report: SupportPerformanceReport }) {
  const { level, metrics } = report.health;
  const met = metrics.filter((metric) => metric.level === "on_target").length;
  return (
    <div className="space-y-4">
      <p className="text-footnote text-muted-foreground">
        <HintedText label="O pior nível entre as 4 metas abaixo" className="hinted-term">
          Saúde do suporte {periodWhen(report.period)}
        </HintedText>
      </p>
      <div className="flex items-center gap-3.5">
        <LevelIcon level={level} />
        <span className="min-w-0">
          <span className={cn("block text-3xl font-semibold tracking-tight", LEVEL_TEXT[level])}>
            {HEALTH_LEVEL_LABELS[level]}
          </span>
          <span className="block text-sm text-muted-foreground tabular-nums">
            {met} de {metrics.length} metas batidas
          </span>
        </span>
      </div>
      <TargetBars report={report} />
      <History report={report} />
    </div>
  );
}

const BADGE_TONES: Record<HealthAction["tone"], string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
};

function ActionBody({ action, index }: { action: HealthAction; index: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
          BADGE_TONES[action.tone],
        )}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{action.title}</span>
        <span className="block text-xs text-muted-foreground">{action.detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-footnote font-medium">
        {action.cta}
        <CaretRightIcon className="size-3.5" aria-hidden="true" />
      </span>
    </>
  );
}

const ACTION_ROW =
  "flex min-h-14 w-full items-center gap-3 rounded-2xl bg-muted/60 px-3.5 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

interface CardActions {
  onSelectMetric: (metric: HealthMetricKey) => void;
  onShowHours: () => void;
}

function ActionRow({
  action,
  index,
  handlers,
}: {
  action: HealthAction;
  index: number;
  handlers: CardActions;
}): ReactNode {
  const body = <ActionBody action={action} index={index} />;
  const { target } = action;
  if (target.kind === "queue") {
    return (
      <Link to="/admin/chamados" search={target.search} className={ACTION_ROW}>
        {body}
      </Link>
    );
  }
  if (target.kind === "person") {
    return (
      <Link
        from="/admin/chamados/metricas"
        to="/admin/chamados/metricas"
        search={(previous) => ({ ...previous, pessoa: target.agentId })}
        className={ACTION_ROW}
      >
        {body}
      </Link>
    );
  }
  const onClick =
    target.kind === "hours" ? handlers.onShowHours : () => handlers.onSelectMetric(target.metric);
  return (
    <button type="button" onClick={onClick} className={ACTION_ROW}>
      {body}
    </button>
  );
}

function WhatToDo({
  report,
  handlers,
}: {
  report: SupportPerformanceReport;
  handlers: CardActions;
}) {
  const actions = healthActions(report);
  const { rating } = report.overview;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="text-subhead font-medium text-muted-foreground">O que resolver primeiro</h2>
      {actions.length === 0 ? (
        <p className="rounded-2xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
          Nada pede ação agora: todas as metas medidas estão em dia.
        </p>
      ) : (
        <ol className="space-y-2">
          {actions.map((action, index) => (
            <li key={action.key}>
              <ActionRow action={action} index={index} handlers={handlers} />
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        onClick={() => handlers.onSelectMetric("rating")}
        className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start rounded-full text-footnote text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Nota dos clientes
        <strong className="font-semibold text-foreground tabular-nums">
          {formatHealthValue("rating", rating.value)}
        </strong>
        <StarIcon weight="fill" className="size-3.5 text-amber-500" aria-hidden="true" />
        <span className="tabular-nums">
          · {count.format(rating.sample)} {rating.sample === 1 ? "avaliação" : "avaliações"} · ver
          por estrelas
        </span>
      </button>
    </div>
  );
}

export function SupportHealthCard({
  report,
  onSelectMetric,
  onShowHours,
}: { report: SupportPerformanceReport } & CardActions) {
  return (
    <section
      aria-label="Saúde do suporte"
      className="surface-card grid gap-6 rounded-3xl bg-card p-5 sm:p-6 md:grid-cols-2 md:gap-10"
    >
      <HowWeStand report={report} />
      <WhatToDo report={report} handlers={{ onSelectMetric, onShowHours }} />
    </section>
  );
}
