import type { TicketEventView, TicketThread } from "@sellbridge/database/repositories";
import { staffResponseStateText } from "@/features/support/response-time";
import { ticketTopicLabel } from "@/features/support/ticket-audience";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketPriority,
} from "@sellbridge/shared/schemas";
import {
  hasStaffPermission,
  STAFF_ROLE_LABELS,
  staffRoleOf,
} from "@sellbridge/shared/staff-access";
import { MAX_RATING } from "@sellbridge/shared/ticket-rules";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { SmartDate } from "@/components/data/smart-date";
import { ResponseDeadlineBadge } from "@/components/support/ticket-badges";
import { RatingStars } from "@/components/support/ticket-rating";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  staffAssignTicket,
  staffSetTicketCategory,
  staffSetTicketPriority,
} from "@/features/support/support.functions";
import { supportTeamQueryOptions } from "@/features/support/support.queries";
import { errorMessage } from "@/lib/errors";

type Ticket = TicketThread["ticket"];

const NOBODY = "__nobody__";

function useTicketChange<TInput>(run: (input: TInput) => Promise<unknown>, success: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

type AssignChange = ReturnType<typeof useTicketChange<string | null>>;

/** Supervisors and admins hand the ticket to anyone on the team. */
function TeamAssigneeSelect({ ticket, assign }: { ticket: Ticket; assign: AssignChange }) {
  const team = useQuery(supportTeamQueryOptions());
  return (
    <Select
      value={ticket.assigneeId ?? NOBODY}
      disabled={assign.isPending}
      onValueChange={(next) => assign.mutate(next === NOBODY ? null : next)}
    >
      <SelectTrigger aria-label="Responsável pelo chamado" className="w-full">
        <SelectValue>{ticket.assigneeName ?? "Sem responsável"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NOBODY}>Sem responsável</SelectItem>
        {(team.data ?? []).map((member) => {
          const role = staffRoleOf(member.role);
          return (
            <SelectItem key={member.id} value={member.id}>
              {member.name}
              {role ? ` · ${STAFF_ROLE_LABELS[role]}` : ""}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * Supervisors pick anyone on the team; an agent can only take a ticket nobody has or hand
 * their own back to the queue (the server enforces the same rule).
 */
function AssigneeControl({ ticket, viewer }: { ticket: Ticket; viewer: Viewer }) {
  const assign = useTicketChange(
    (assigneeId: string | null) => staffAssignTicket({ data: { ticketId: ticket.id, assigneeId } }),
    "Responsável atualizado",
  );
  if (hasStaffPermission(viewer.role, "support.assign_others")) {
    return <TeamAssigneeSelect ticket={ticket} assign={assign} />;
  }
  if (ticket.assigneeId === null) {
    return (
      <Button
        size="sm"
        disabled={assign.isPending}
        onClick={() => assign.mutate(viewer.userId)}
        className="w-fit"
      >
        Assumir chamado
      </Button>
    );
  }
  if (ticket.assigneeId === viewer.userId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Você</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={assign.isPending}
          onClick={() => assign.mutate(null)}
        >
          Devolver para a fila
        </Button>
      </div>
    );
  }
  return <span className="text-sm">{ticket.assigneeName}</span>;
}

function PriorityControl({ ticket }: { ticket: Ticket }) {
  const change = useTicketChange(
    (priority: TicketPriority) =>
      staffSetTicketPriority({ data: { ticketId: ticket.id, priority } }),
    "Prioridade atualizada",
  );
  return (
    <Select
      value={ticket.priority}
      disabled={change.isPending}
      onValueChange={(next) => {
        const priority = TICKET_PRIORITIES.find((option) => option === next);
        if (priority) {
          change.mutate(priority);
        }
      }}
    >
      <SelectTrigger aria-label="Prioridade do chamado" className="w-full">
        <SelectValue>{TICKET_PRIORITY_LABELS[ticket.priority]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TICKET_PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={priority}>
            {TICKET_PRIORITY_LABELS[priority]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CategoryControl({ ticket }: { ticket: Ticket }) {
  const change = useTicketChange(
    (category: TicketCategory) =>
      staffSetTicketCategory({ data: { ticketId: ticket.id, category } }),
    "Tema atualizado",
  );
  return (
    <Select
      value={ticket.category}
      disabled={change.isPending}
      onValueChange={(next) => {
        const category = TICKET_CATEGORIES.find((option) => option === next);
        if (category) {
          change.mutate(category);
        }
      }}
    >
      <SelectTrigger aria-label="Tema do chamado" className="w-full">
        <SelectValue>{ticketTopicLabel(ticket.category, ticket.tenantKind)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TICKET_CATEGORIES.map((category) => (
          <SelectItem key={category} value={category}>
            {ticketTopicLabel(category, ticket.tenantKind)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ResponseState({ ticket }: { ticket: Ticket }) {
  const text = staffResponseStateText(ticket.status, ticket.awaitingSince);
  if (text !== null) {
    return <span className="text-sm text-muted-foreground">{text}</span>;
  }
  return (
    <ResponseDeadlineBadge
      status={ticket.status}
      priority={ticket.priority}
      awaitingSince={ticket.awaitingSince}
    />
  );
}

interface Viewer {
  userId: string;
  role: string;
}

/** Who handles the ticket, how urgent it is, its deadline and how the reseller rated it. */
export function TicketTriagePanel({ ticket, viewer }: { ticket: Ticket; viewer: Viewer }) {
  return (
    <section aria-label="Atendimento" className="surface-card space-y-4 rounded-3xl bg-card p-5">
      <PanelRow label="Responsável">
        <AssigneeControl ticket={ticket} viewer={viewer} />
      </PanelRow>
      <PanelRow label="Prioridade">
        <PriorityControl ticket={ticket} />
      </PanelRow>
      <PanelRow label="Tema">
        <CategoryControl ticket={ticket} />
      </PanelRow>
      <PanelRow label="Prazo de resposta">
        <ResponseState ticket={ticket} />
      </PanelRow>
      {ticket.firstResponseAt ? (
        <PanelRow label="Primeira resposta">
          <SmartDate date={ticket.firstResponseAt} className="text-sm" />
        </PanelRow>
      ) : null}
      {ticket.rating === null ? null : (
        <PanelRow label="Avaliação do revendedor">
          <RatingStars rating={ticket.rating} />
          {ticket.ratingComment ? (
            <p className="text-sm text-muted-foreground">“{ticket.ratingComment}”</p>
          ) : null}
        </PanelRow>
      )}
    </section>
  );
}

function labelOf(labels: Readonly<Record<string, string>>, value: string | null): string {
  if (value === null) {
    return "—";
  }
  return labels[value] ?? value;
}

/** One line per change, written like a sentence: "Ana assumiu", "Prioridade: Normal → Alta". */
function describeEvent(event: TicketEventView): string {
  if (event.automatic) {
    return "Encerrado automaticamente por falta de retorno";
  }
  const actor = event.actorName ?? "Usuário removido";
  if (event.type === "status_changed") {
    return `${actor}: ${labelOf(TICKET_STATUS_LABELS, event.fromValue)} → ${labelOf(TICKET_STATUS_LABELS, event.toValue)}`;
  }
  if (event.type === "assigned") {
    if (event.toValue === null) {
      return `${actor} devolveu para a fila`;
    }
    if (event.isSelfAssignment) {
      return `${actor} assumiu o chamado`;
    }
    return `${actor} passou para ${event.toValue}`;
  }
  if (event.type === "priority_changed") {
    return `${actor}: prioridade ${labelOf(TICKET_PRIORITY_LABELS, event.fromValue)} → ${labelOf(TICKET_PRIORITY_LABELS, event.toValue)}`;
  }
  if (event.type === "category_changed") {
    return `${actor}: tema ${labelOf(TICKET_CATEGORY_LABELS, event.fromValue)} → ${labelOf(TICKET_CATEGORY_LABELS, event.toValue)}`;
  }
  if (event.type === "order_linked") {
    return `${actor} vinculou o pedido #${event.toValue ?? ""}`;
  }
  if (event.type === "order_unlinked") {
    return `${actor} desvinculou o pedido #${event.fromValue ?? ""}`;
  }
  if (event.type === "follower_added") {
    return `${actor} adicionou ${event.toValue ?? "um colega"} ao chamado`;
  }
  return `${actor} avaliou com ${event.toValue ?? "?"} de ${MAX_RATING}`;
}

/** What changed on the ticket, newest first, for whoever picks it up next. */
export function TicketHistory({ events }: { events: readonly TicketEventView[] }) {
  if (events.length === 0) {
    return null;
  }
  return (
    <section aria-label="Histórico" className="surface-card space-y-3 rounded-3xl bg-card p-5">
      <h2 className="text-xs text-muted-foreground">Histórico</h2>
      <ol className="space-y-2.5">
        {events.toReversed().map((event) => (
          <li key={event.id} className="space-y-0.5">
            <p className="text-sm">{describeEvent(event)}</p>
            <SmartDate date={event.createdAt} className="text-xs text-muted-foreground" />
          </li>
        ))}
      </ol>
    </section>
  );
}
