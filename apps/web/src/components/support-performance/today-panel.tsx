import type {
  SupportPerformanceReport,
  SupportToday,
  TodayEvent,
} from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import {
  formatMinutes,
  formatRating,
  subjectFullLabel,
  topicLabel,
} from "@/features/support/performance-format";
import { cn } from "@/lib/utils";

/*
 * The day panel of a single-day period: the day's numbers (and, for today, what waits right
 * now), who did what, and a short timeline of what happened to tickets, newest first.
 */

const SeeAllIcon = ACTION_ICONS.seeAll.icon;
const count = new Intl.NumberFormat("pt-BR");
const PEOPLE_SHOWN = 5;
const clock = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

interface Stat {
  label: string;
  value: string;
  tone?: "danger" | "info" | "warning";
}

function statsOf(report: SupportPerformanceReport, today: SupportToday): Stat[] {
  const day: Stat[] = [
    { label: today.isToday ? "Entraram hoje" : "Entraram", value: count.format(today.opened) },
    { label: "Respostas da equipe", value: count.format(today.replies) },
    {
      label: today.isToday ? "Resolvidos hoje" : "Resolvidos",
      value: count.format(today.resolved),
    },
  ];
  if (today.isToday) {
    return [
      ...day,
      { label: "Na fila agora", value: count.format(report.queue.open) },
      { label: "Sem responsável", value: count.format(report.queue.unassigned), tone: "info" },
      { label: "Fora do prazo agora", value: count.format(report.queue.overdue), tone: "danger" },
    ];
  }
  return [
    ...day,
    { label: "1ª resposta (mediana)", value: formatMinutes(today.firstResponseMinutes) },
    { label: "Nota do dia", value: formatRating(today.rating.value) },
    { label: "Voltaram depois", value: count.format(today.cameBack), tone: "warning" },
  ];
}

const STAT_TONES: Record<NonNullable<Stat["tone"]>, string> = {
  danger: "text-destructive",
  info: "text-sky-700 dark:text-sky-300",
  warning: "text-amber-700 dark:text-amber-300",
};

function DayTitle({ report, today }: { report: SupportPerformanceReport; today: SupportToday }) {
  if (today.isToday) {
    return "Hoje";
  }
  return `Em ${dayMonth.format(new Date(`${report.period.fromDate}T12:00:00Z`))}`;
}

function People({ report }: { report: SupportPerformanceReport }) {
  const people = report.team
    .filter((agent) => agent.replies > 0 || (agent.resolved.current ?? 0) > 0 || agent.openNow > 0)
    .toSorted((first, second) => second.replies - first.replies)
    .slice(0, PEOPLE_SHOWN);
  if (people.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Ninguém da equipe respondeu neste dia.
      </p>
    );
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-2 text-left font-normal">
              Pessoa
            </th>
            <th scope="col" className="px-3 pb-2 text-right font-normal">
              Respondeu
            </th>
            <th scope="col" className="px-3 pb-2 text-right font-normal">
              Resolveu
            </th>
            <th scope="col" className="pb-2 pl-3 text-right font-normal">
              Com a pessoa
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {people.map((agent) => (
            <tr key={agent.id}>
              <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                {agent.name}
              </th>
              <td className="px-3 py-2.5 text-right">{count.format(agent.replies)}</td>
              <td className="px-3 py-2.5 text-right font-medium">
                {count.format(agent.resolved.current ?? 0)}
              </td>
              <td className="py-2.5 pl-3 text-right">{count.format(agent.openNow)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EVENT_DOTS: Record<TodayEvent["kind"], string> = {
  opened: "bg-sky-500",
  resolved: "bg-chart-brand",
  rated: "bg-amber-500",
};

function eventTitle(event: TodayEvent, names: ReadonlyMap<string, string>): string {
  const subject = `“${subjectFullLabel(event)}”`;
  const agent = event.agentId === null ? undefined : names.get(event.agentId)?.split(" ")[0];
  if (event.kind === "opened") {
    return `Novo chamado: ${subject}`;
  }
  if (event.kind === "resolved") {
    return agent === undefined ? `Resolvido: ${subject}` : `${agent} resolveu ${subject}`;
  }
  return `Avaliação de ${event.rating ?? 0} ${event.rating === 1 ? "estrela" : "estrelas"}`;
}

function Timeline({ report, today }: { report: SupportPerformanceReport; today: SupportToday }) {
  const names = new Map(report.team.map((agent) => [agent.id, agent.name]));
  if (today.events.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">Nada aconteceu neste dia.</p>
    );
  }
  return (
    <ol className="divide-y">
      {today.events.map((event) => (
        <li key={`${event.kind}-${event.ticketId}-${event.at}`}>
          <Link
            to="/admin/chamados/$ticketId"
            params={{ ticketId: event.ticketId }}
            className="flex min-h-11 items-start gap-3 rounded-lg py-2.5 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="w-11 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
              {clock.format(new Date(event.at))}
            </span>
            <span
              aria-hidden="true"
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", EVENT_DOTS[event.kind])}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{eventTitle(event, names)}</span>
              <span className="block text-xs text-muted-foreground">
                {topicLabel(event.origin, event.category)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function TodayPanel({
  report,
  today,
}: {
  report: SupportPerformanceReport;
  today: SupportToday;
}) {
  return (
    <section
      aria-label="O dia na equipe"
      className="surface-card grid gap-x-8 gap-y-6 rounded-3xl bg-card p-5 sm:p-6 lg:grid-cols-2"
    >
      <div className="min-w-0 space-y-4">
        <h2 className="text-subhead font-medium text-muted-foreground">
          <DayTitle report={report} today={today} /> na equipe
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {statsOf(report, today).map((stat) => (
            <li key={stat.label} className="rounded-2xl bg-muted/60 px-3.5 py-3">
              <span className="block text-xs text-muted-foreground">{stat.label}</span>
              <span
                className={cn(
                  "block text-2xl font-semibold tracking-tight tabular-nums",
                  stat.tone === undefined ? null : STAT_TONES[stat.tone],
                )}
              >
                {stat.value}
              </span>
            </li>
          ))}
        </ul>
        <People report={report} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-subhead font-medium text-muted-foreground">
          O que aconteceu {today.isToday ? "hoje" : "no dia"}
        </h2>
        <Timeline report={report} today={today} />
        <Link
          to="/admin/chamados"
          search={{ queue: "all" }}
          className="mt-auto flex h-11 items-center justify-center gap-1.5 rounded-full bg-muted text-sm font-medium transition-colors outline-none hover:bg-foreground hover:text-background focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Ver os chamados na fila
          <SeeAllIcon className="size-3.5" weight="bold" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
