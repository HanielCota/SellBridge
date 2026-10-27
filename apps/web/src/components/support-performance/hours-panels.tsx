import type {
  HeatCell,
  HeatTicket,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import { CheckIcon, InfoIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { SmartDate } from "@/components/data/smart-date";
import { formatMinutes, subjectFullLabel } from "@/features/support/performance-format";
import {
  cellTitle,
  formatPerWeek,
  outsideSummary,
  peakText,
  peakWindow,
  perWeek,
  perWeekUnit,
  slowestCell,
  weeksOf,
  WEEKDAY_SHORT,
  type CellTip,
} from "@/features/support/performance-hours";
import { formatPercent } from "@/lib/percent";
import { cn } from "@/lib/utils";
import type { CellAnchor } from "./hours-heatmap";

/*
 * The pieces around the hours map: the hover card of a cell, the panel a click pins under the
 * map with the slot's latest tickets, and three plain-language findings.
 */

const TIP_WIDTH = 260;
// The card needs about this much room above the cell; nearer the top it opens below instead.
const TIP_ROOM = 250;

const NOTE_TONES: Record<CellTip["noteTone"], string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  good: "bg-chart-brand/12 text-brand-text",
};

const NOTE_ICONS: Record<CellTip["noteTone"], typeof CheckIcon> = {
  danger: WarningIcon,
  warning: WarningIcon,
  info: InfoIcon,
  good: CheckIcon,
};

export function HourCellTip({ anchor, tip }: { anchor: CellAnchor; tip: CellTip }) {
  const above = anchor.top >= TIP_ROOM;
  const left = Math.min(Math.max(anchor.centerX - TIP_WIDTH / 2, 0), anchor.width - TIP_WIDTH);
  const Icon = NOTE_ICONS[tip.noteTone];
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 flex flex-col gap-1.5 rounded-2xl bg-popover px-4 py-3.5 text-popover-foreground shadow-lg ring-1 ring-border animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      style={{
        width: TIP_WIDTH,
        left,
        top: above ? anchor.top - 10 : anchor.bottom + 10,
        transform: above ? "translateY(-100%)" : undefined,
      }}
    >
      <span className="text-xs font-medium text-muted-foreground">{tip.title}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{tip.value}</span>
        <span className="text-sm text-muted-foreground">{tip.unit}</span>
      </span>
      <span className="text-xs text-muted-foreground">{tip.rank}</span>
      <TipFacts tip={tip} />
      <span
        className={cn(
          "mt-1 flex items-start gap-2 rounded-xl px-2.5 py-2 text-xs",
          NOTE_TONES[tip.noteTone],
        )}
      >
        <Icon className="mt-px size-3.5 shrink-0" weight="bold" aria-hidden="true" />
        {tip.note}
      </span>
      <span className="text-caption text-muted-foreground">
        Clique para ver os chamados deste horário
      </span>
    </div>
  );
}

function TipFacts({ tip }: { tip: CellTip }) {
  return (
    <dl className="mt-1.5 space-y-2 border-t pt-2.5 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">1ª resposta (mediana)</dt>
        <dd className="text-right tabular-nums">
          <span
            className={cn(
              "font-semibold",
              tip.waitTone === "slow" && "text-destructive",
              tip.waitTone === "fast" && "text-brand-text",
            )}
          >
            {tip.wait}
          </span>
          {tip.waitGap === null ? null : (
            <span className="block text-muted-foreground">{tip.waitGap}</span>
          )}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">Equipe respondendo</dt>
        <dd className="font-semibold tabular-nums">{tip.responders}</dd>
      </div>
      {tip.subject === null ? null : (
        <div>
          <dt className="text-muted-foreground">Assunto mais comum</dt>
          <dd className="font-semibold">{tip.subject}</dd>
        </div>
      )}
    </dl>
  );
}

const STATUS_COPY: Record<HeatTicket["status"], { text: string; className: string }> = {
  answered_on_time: { text: "Respondido no prazo", className: "text-brand-text" },
  answered_late: {
    text: "Respondido fora do prazo",
    className: "text-amber-700 dark:text-amber-300",
  },
  waiting: { text: "Esperando resposta", className: "text-muted-foreground" },
  late: { text: "Fora do prazo", className: "text-destructive" },
};

export function PickedCellPanel({
  report,
  cell,
  onClose,
}: {
  report: SupportPerformanceReport;
  cell: HeatCell;
  onClose: () => void;
}) {
  const names = new Map(report.team.map((agent) => [agent.id, agent.name]));
  return (
    <section aria-label={cellTitle(cell)} className="space-y-2 rounded-2xl bg-muted/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{cellTitle(cell)}</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatPerWeek(perWeek(cell, weeksOf(report)))} chamados {perWeekUnit(report)} · os{" "}
            {cell.recent.length} mais recentes
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {cell.recent.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-5 text-center text-sm text-muted-foreground">
          Nenhum chamado neste horário no período.
        </p>
      ) : (
        <ul className="space-y-1">
          {cell.recent.map((ticket) => (
            <PickedTicketRow
              key={ticket.ticketId}
              ticket={ticket}
              agent={ticket.agentId === null ? undefined : names.get(ticket.agentId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PickedTicketRow({ ticket, agent }: { ticket: HeatTicket; agent: string | undefined }) {
  const status = STATUS_COPY[ticket.status];
  return (
    <li>
      <Link
        to="/admin/chamados/$ticketId"
        params={{ ticketId: ticket.ticketId }}
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-card px-3 py-2 outline-none hover:ring-1 hover:ring-border focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{subjectFullLabel(ticket)}</span>
          <span className="block text-xs text-muted-foreground">
            {agent === undefined ? null : `${agent} · `}
            <SmartDate date={new Date(ticket.createdAt)} />
          </span>
        </span>
        <span className={cn("shrink-0 text-xs font-semibold", status.className)}>
          {status.text}
        </span>
      </Link>
    </li>
  );
}

function Insight({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <li className="space-y-0.5 rounded-2xl bg-muted/60 px-3.5 py-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-sm font-semibold">{value}</span>
      <span className="block text-xs text-muted-foreground">{note}</span>
    </li>
  );
}

export function HoursInsights({ report }: { report: SupportPerformanceReport }) {
  const peak = peakWindow(report.heatmap);
  const slowest = slowestCell(report.heatmap);
  const outside = outsideSummary(report.heatmap);
  const weeks = weeksOf(report);
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      <Insight
        label="Pico da semana"
        value={peak === null ? "—" : peakText(peak)}
        note={
          peak === null
            ? "Nenhum chamado no período"
            : `${formatPerWeek(peak.opened / weeks)} chamados ${perWeekUnit(report)} nessas 2 horas`
        }
      />
      <Insight
        label="Fora do horário"
        value={outside.share === null ? "—" : `${formatPercent(outside.share)} dos chamados`}
        note={
          outside.minutes === null
            ? "Chegam com a equipe fechada"
            : `Esperam o suporte abrir: até ${formatMinutes(outside.minutes)}`
        }
      />
      <Insight
        label="Maior espera no horário"
        value={
          slowest === null || slowest.hour === "outside"
            ? "—"
            : `${WEEKDAY_SHORT[slowest.weekday] ?? ""}, ${slowest.hour}h`
        }
        note={
          slowest === null
            ? "Poucos chamados para medir"
            : `1ª resposta em ${formatMinutes(slowest.firstResponseMinutes)} (mediana)`
        }
      />
    </ul>
  );
}
