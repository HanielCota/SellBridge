import type { AgentPerformance } from "@sellbridge/shared/support-performance";
import { subjectKeyOf } from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import {
  CaretRightIcon,
  ChatCircleTextIcon,
  ClockCountdownIcon,
  TrayIcon,
} from "@phosphor-icons/react";
import { RatingStars } from "@/components/support/ticket-rating";
import { HintedText } from "@/components/ui/hint";
import { formatDuration } from "@/features/support/response-time";
import {
  EMPTY_FIGURE,
  formatMinutes,
  formatRate,
  rateSampleText,
  subjectFullLabel,
} from "@/features/support/performance-format";
import { cn } from "@/lib/utils";

/*
 * The bottom row of a person's sheet, in the dashboard's card style: what is with them now,
 * how they do per subject against the team, and the ratings worth reading.
 */

const count = new Intl.NumberFormat("pt-BR");
const ROW_CLASSES =
  "flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50";

function CardTitle({ id, children }: { id: string; children: string }) {
  return (
    <div className="-my-1 flex h-8 items-center">
      <h2 id={id} className="text-subhead font-medium text-muted-foreground">
        {children}
      </h2>
    </div>
  );
}

function lastReplyText(lastReplyAt: string | null, now: Date): string {
  if (lastReplyAt === null) {
    return "Sem respostas no período";
  }
  return `Respondeu há ${formatDuration(now.getTime() - new Date(lastReplyAt).getTime())}`;
}

function OverdueRow({ agent }: { agent: AgentPerformance }) {
  const late = agent.overdueNow > 0;
  return (
    <Link
      to="/admin/chamados"
      search={{ queue: "overdue", responsavel: agent.id }}
      className={ROW_CLASSES}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          late
            ? "bg-destructive/10 text-destructive"
            : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
        )}
      >
        <ClockCountdownIcon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {count.format(agent.overdueNow)} fora do prazo
        </span>
        <span className="block text-xs text-muted-foreground">
          {agent.oldestAwaitingMinutes === null
            ? "Ninguém esperando resposta"
            : `O mais antigo espera há ${formatMinutes(agent.oldestAwaitingMinutes)}`}
        </span>
      </span>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function OpenRow({ agent }: { agent: AgentPerformance }) {
  return (
    <Link
      to="/admin/chamados"
      search={{ queue: "all", responsavel: agent.id }}
      className={ROW_CLASSES}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300">
        <TrayIcon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">
        {count.format(agent.openNow)} em aberto
      </span>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** Live state: late tickets first, then the load and the last sign of activity. */
export function NowCard({ agent, now }: { agent: AgentPerformance; now: Date }) {
  return (
    <section
      aria-labelledby="person-now-title"
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <CardTitle id="person-now-title">Agora</CardTitle>
      <ul className="-mx-2 mt-4 space-y-1">
        <li>
          <OverdueRow agent={agent} />
        </li>
        <li>
          <OpenRow agent={agent} />
        </li>
        <li className="flex items-center gap-3 px-2 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ChatCircleTextIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium">{lastReplyText(agent.lastReplyAt, now)}</span>
        </li>
      </ul>
    </section>
  );
}

function PersonSubjectRow({ subject }: { subject: AgentPerformance["subjects"][number] }) {
  const own = subject.noReopen.value;
  const team = subject.teamNoReopen.value;
  const worse = own !== null && team !== null && own < team;
  return (
    <tr>
      <th scope="row" className="py-3 pr-3 text-left font-normal">
        <span className="line-clamp-2">{subjectFullLabel(subject)}</span>
      </th>
      <td className="py-3 text-right font-medium">{count.format(subject.resolved)}</td>
      <td className="py-3 text-right">
        <HintedText
          label={rateSampleText(subject.noReopen, "encerrados")}
          className={cn(worse && "font-medium text-destructive")}
        >
          {formatRate(subject.noReopen)}
        </HintedText>
        <span className="block text-xs text-muted-foreground">
          equipe {team === null ? EMPTY_FIGURE : formatRate(subject.teamNoReopen)}
        </span>
      </td>
    </tr>
  );
}

/** Per subject: the person's "sem reabrir" beside the team's, so training goes where it counts. */
export function PersonSubjectsCard({ agent }: { agent: AgentPerformance }) {
  return (
    <section
      aria-labelledby="person-subjects-title"
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <CardTitle id="person-subjects-title">Por assunto</CardTitle>
      {agent.subjects.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum resolvido no período.
        </p>
      ) : (
        <table className="mt-5 w-full table-fixed text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-2 font-normal">
                Assunto
              </th>
              <th scope="col" className="w-16 pb-2 text-right font-normal">
                Resolv.
              </th>
              <th scope="col" className="w-28 pb-2 text-right font-normal">
                <HintedText
                  label="Sem reabrir: da pessoa e da equipe no mesmo assunto"
                  className="hinted-term"
                >
                  Sem reabrir
                </HintedText>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {agent.subjects.slice(0, 6).map((subject) => (
              <PersonSubjectRow key={subjectKeyOf(subject)} subject={subject} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The ratings of 1 to 3 stars, each opening its ticket. */
export function LowRatingsCard({ agent }: { agent: AgentPerformance }) {
  return (
    <section
      aria-labelledby="person-ratings-title"
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <CardTitle id="person-ratings-title">Avaliações de 1 a 3</CardTitle>
      {agent.lowRatings.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-6 text-center text-subhead font-medium">
          Nenhuma nota baixa
        </div>
      ) : (
        <ul className="-mx-2 mt-4 space-y-1">
          {agent.lowRatings.map((rating) => (
            <li key={`${rating.ticketId}-${rating.ratedAt}`}>
              <Link
                to="/admin/chamados/$ticketId"
                params={{ ticketId: rating.ticketId }}
                className={cn(ROW_CLASSES, "items-start")}
              >
                <RatingStars rating={rating.rating} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {subjectFullLabel(rating)}
                  </span>
                  {rating.comment ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      “{rating.comment}”
                    </span>
                  ) : null}
                </span>
                <CaretRightIcon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
