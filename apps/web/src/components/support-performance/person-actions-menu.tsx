import type {
  AgentPerformance,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CaretDownIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { staffReassignOverdue } from "@/features/support/support.functions";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/*
 * What the coordination does from a person's sheet: open their queue at the right cut (late
 * first) and, when they are behind, hand the late tickets to whoever has the most room.
 */

const count = new Intl.NumberFormat("pt-BR");

function firstName(agent: Pick<AgentPerformance, "name">): string {
  return agent.name.split(" ")[0] ?? agent.name;
}

/** Who has the most room: nothing late, enough tickets to compare, the fewest open. */
export function lightestColleague(
  report: SupportPerformanceReport,
  agent: AgentPerformance,
): AgentPerformance | undefined {
  return report.team
    .filter(
      (other) => other.id !== agent.id && other.overdueNow === 0 && other.standing !== "too_few",
    )
    .toSorted((first, second) => first.openNow - second.openNow)
    .at(0);
}

function QueueItem({
  label,
  hint,
  amount,
  danger,
  search,
}: {
  label: string;
  hint: string;
  amount: number | null;
  danger?: boolean;
  search: Record<string, string>;
}) {
  return (
    <Link
      to="/admin/chamados"
      search={search}
      className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      {amount === null ? null : (
        <span
          className={cn(
            "grid h-6 min-w-7 shrink-0 place-items-center rounded-full px-2 text-xs font-semibold tabular-nums",
            danger === true && amount > 0 ? "bg-destructive/10 text-destructive" : "bg-muted",
          )}
        >
          {count.format(amount)}
        </span>
      )}
    </Link>
  );
}

function Reassign({ agent, to }: { agent: AgentPerformance; to: AgentPerformance }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => staffReassignOverdue({ data: { fromId: agent.id, toId: to.id } }),
    onSuccess: async (result) => {
      toast.success(
        `${count.format(result.moved)} ${result.moved === 1 ? "chamado passado" : "chamados passados"} para ${firstName(to)}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="mt-1.5 space-y-2 border-t px-3 pt-3 pb-1">
      <p className="text-sm font-semibold">Passar os atrasados para outra pessoa</p>
      <p className="text-xs text-muted-foreground">
        {firstName(to)} tem {count.format(to.openNow)} em aberto e nada atrasado: é quem está mais
        livre agora.
      </p>
      <button
        type="button"
        disabled={mutation.isPending || mutation.isSuccess}
        onClick={() => mutation.mutate()}
        className="flex h-10 w-full items-center justify-center rounded-full bg-foreground text-sm font-medium text-background outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        {mutation.isSuccess
          ? `Passados para ${firstName(to)}`
          : `Passar ${count.format(agent.overdueNow)} ${agent.overdueNow === 1 ? "chamado" : "chamados"} para ${firstName(to)}`}
      </button>
    </div>
  );
}

export function PersonActionsMenu({
  report,
  agent,
  canReassign,
}: {
  report: SupportPerformanceReport;
  agent: AgentPerformance;
  canReassign: boolean;
}) {
  const name = firstName(agent);
  const lightest = lightestColleague(report, agent);
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        Ver chamados de {name}
        <CaretDownIcon className="size-3.5" weight="bold" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={8} className="w-80 p-2">
        <nav aria-label={`Chamados de ${name}`} className="space-y-0.5">
          <QueueItem
            label="Fora do prazo"
            hint="Responder primeiro"
            amount={agent.overdueNow}
            danger
            search={{ queue: "overdue", responsavel: agent.id }}
          />
          <QueueItem
            label={`Esperando resposta de ${name}`}
            hint="O cliente escreveu e aguarda"
            amount={null}
            search={{ queue: "all", status: "open", responsavel: agent.id }}
          />
          <QueueItem
            label={`Todos os abertos com ${name}`}
            hint="A fila inteira da pessoa"
            amount={agent.openNow}
            search={{ queue: "all", responsavel: agent.id }}
          />
        </nav>
        {canReassign && agent.overdueNow > 0 && lightest !== undefined ? (
          <Reassign agent={agent} to={lightest} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
