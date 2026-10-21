import {
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type TicketStatus,
  type TicketsSearch,
} from "@sellbridge/shared/schemas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL_STATUSES = "__all__";

/**
 * "Todos os status" plus one option per ticket status; undefined means no filter. `labels`: the
 * team's words by default; customer screens pass their own, as their badges do.
 */
export function TicketStatusFilter({
  value,
  onChange,
  className,
  labels = TICKET_STATUS_LABELS,
}: {
  value: TicketsSearch["status"];
  onChange: (status: TicketsSearch["status"]) => void;
  className?: string;
  labels?: Record<TicketStatus, string>;
}) {
  return (
    <Select
      value={value ?? ALL_STATUSES}
      onValueChange={(next) => onChange(TICKET_STATUSES.find((status) => status === next))}
    >
      <SelectTrigger className={cn("sm:w-56", className)} aria-label="Filtrar chamados por status">
        <SelectValue>{value ? labels[value] : "Todos os status"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_STATUSES}>Todos os status</SelectItem>
        {TICKET_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {labels[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
