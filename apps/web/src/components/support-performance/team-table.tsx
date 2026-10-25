import { STAFF_ROLE_LABELS } from "@sellbridge/shared/staff-access";
import {
  NO_REOPEN_ABOVE_TEAM_GAP,
  NO_REOPEN_NEEDS_SUPPORT_GAP,
  ON_TIME_ABOVE_TEAM_FROM,
  ON_TIME_NEEDS_SUPPORT_BELOW,
  type AgentPerformance,
  type SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import { HintedText } from "@/components/ui/hint";
import {
  EMPTY_FIGURE,
  STANDING_TONE_CLASSES,
  formatMinutes,
  formatRate,
  formatRating,
  rateSampleText,
  standingCopy,
  tenureText,
} from "@/features/support/performance-format";
import { formatPercent } from "@/lib/percent";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

/*
 * Every team member side by side, in the Financeiro's table style. Colors only flag what the
 * coordinator should look at, and never for someone with too few resolutions to compare.
 */

const oneDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("pt-BR");

function compared(agent: AgentPerformance): boolean {
  return agent.standing !== "too_few";
}

function noReopenTone(agent: AgentPerformance): string {
  const own = agent.noReopen.value;
  if (!compared(agent) || own === null || agent.expectedNoReopen === null) {
    return "";
  }
  if (own < agent.expectedNoReopen - NO_REOPEN_NEEDS_SUPPORT_GAP) {
    return "text-destructive font-medium";
  }
  return own >= agent.expectedNoReopen + NO_REOPEN_ABOVE_TEAM_GAP
    ? "text-brand-text font-medium"
    : "";
}

function onTimeTone(agent: AgentPerformance): string {
  const own = agent.onTime.value;
  if (!compared(agent) || own === null) {
    return "";
  }
  if (own < ON_TIME_NEEDS_SUPPORT_BELOW) {
    return "text-destructive font-medium";
  }
  return own >= ON_TIME_ABOVE_TEAM_FROM ? "text-brand-text font-medium" : "";
}

function PersonCell({ agent }: { agent: AgentPerformance }) {
  return (
    <Link
      from="/admin/chamados/metricas"
      to="/admin/chamados/metricas"
      search={(previous) => ({ ...previous, pessoa: agent.id })}
      className="flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium"
      >
        {initials(agent.name)}
      </span>
      <span className="min-w-0">
        <span className="block font-medium hover:underline">{agent.name}</span>
        <span className="block text-xs text-muted-foreground">
          {STAFF_ROLE_LABELS[agent.role]} · {tenureText(agent)}
        </span>
      </span>
    </Link>
  );
}

function AgentRow({ agent }: { agent: AgentPerformance }) {
  const standing = standingCopy(agent);
  return (
    <tr>
      <th scope="row" className="py-3 pr-3 text-left font-normal">
        <PersonCell agent={agent} />
      </th>
      <td
        className={cn(
          "px-3 py-3 text-left text-xs font-medium whitespace-nowrap",
          STANDING_TONE_CLASSES[standing.tone],
        )}
      >
        {standing.text}
      </td>
      <td className="px-3 py-3 text-right font-medium">
        {count.format(agent.resolved.current ?? 0)}
      </td>
      <td className="px-3 py-3 text-right text-muted-foreground">
        {agent.resolvedPerActiveDay === null
          ? EMPTY_FIGURE
          : oneDecimal.format(agent.resolvedPerActiveDay)}
      </td>
      <td className="px-3 py-3 text-right">{formatMinutes(agent.firstResponseMinutes)}</td>
      <td className={cn("px-3 py-3 text-right", onTimeTone(agent))}>
        <HintedText label={rateSampleText(agent.onTime, "primeiras respostas")}>
          {formatRate(agent.onTime)}
        </HintedText>
      </td>
      <td className="px-3 py-3 text-right">
        <HintedText
          label={rateSampleText(agent.noReopen, "encerrados")}
          className={noReopenTone(agent)}
        >
          {formatRate(agent.noReopen)}
        </HintedText>
        <span className="block text-xs text-muted-foreground">
          esperado{" "}
          {agent.expectedNoReopen === null ? EMPTY_FIGURE : formatPercent(agent.expectedNoReopen)}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        {formatRating(agent.rating.value)}
        <span className="block text-xs text-muted-foreground">
          {agent.rating.sample} {agent.rating.sample === 1 ? "nota" : "notas"}
        </span>
      </td>
      <td className="py-3 pl-3 text-right">{count.format(agent.openNow)}</td>
    </tr>
  );
}

const HEADERS: readonly { label: string; hint?: string; left?: boolean }[] = [
  { label: "Pessoa", left: true },
  { label: "Situação", left: true },
  { label: "Resolvidos" },
  {
    label: "Por dia ativo",
    hint: "Resolvidos divididos pelos dias em que a pessoa respondeu: folgas não pesam",
  },
  { label: "1ª resposta", hint: "Mediana do tempo até a primeira resposta" },
  { label: "No prazo", hint: "Primeira resposta dentro do prazo da prioridade" },
  { label: "Sem reabrir", hint: "Comparado com o esperado para os mesmos assuntos na equipe" },
  { label: "Nota" },
  { label: "Com a pessoa", hint: "Chamados abertos com a pessoa agora" },
];

function TeamTotalsRow({ report }: { report: SupportPerformanceReport }) {
  const { overview } = report;
  const resolvedPerAgent = overview.resolvedPerAgent;
  return (
    <tr className="text-muted-foreground">
      <th scope="row" className="py-3 pr-3 text-left font-medium">
        Equipe
      </th>
      <td>
        <span className="sr-only">Sem situação</span>
      </td>
      <td className="px-3 py-3 text-right font-medium text-foreground">
        {count.format(overview.resolved.current ?? 0)}
      </td>
      <td className="px-3 py-3 text-right">
        {resolvedPerAgent === null
          ? EMPTY_FIGURE
          : `${oneDecimal.format(resolvedPerAgent)} por pessoa`}
      </td>
      <td className="px-3 py-3 text-right">
        {formatMinutes(overview.firstResponseMinutes.current)}
      </td>
      <td className="px-3 py-3 text-right">{formatRate(overview.onTime)}</td>
      <td className="px-3 py-3 text-right">{formatRate(overview.noReopen)}</td>
      <td className="px-3 py-3 text-right">{formatRating(overview.rating.value)}</td>
      <td className="py-3 pl-3 text-right">{count.format(report.queue.open)}</td>
    </tr>
  );
}

function TeamTableHead() {
  return (
    <thead>
      <tr className="text-xs text-muted-foreground">
        {HEADERS.map((header) => (
          <th
            key={header.label}
            scope="col"
            className={cn(
              "px-3 pb-2 font-normal first:pl-0 last:pr-0",
              header.left ? "text-left" : "text-right",
            )}
          >
            {header.hint === undefined ? (
              header.label
            ) : (
              <HintedText label={header.hint} className="hinted-term">
                {header.label}
              </HintedText>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function TeamTable({ report }: { report: SupportPerformanceReport }) {
  return (
    <section aria-labelledby="team-table-title" className="surface-card rounded-3xl bg-card p-5">
      <h2 id="team-table-title" className="text-subhead font-medium text-muted-foreground">
        Por pessoa · cada chamado conta para quem o resolveu
      </h2>
      {report.team.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Ninguém na equipe de suporte ainda. Convide em Equipe.
        </p>
      ) : (
        <div className="relative mt-5 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm tabular-nums">
            <TeamTableHead />
            <tbody className="divide-y">
              {report.team.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
              <TeamTotalsRow report={report} />
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
