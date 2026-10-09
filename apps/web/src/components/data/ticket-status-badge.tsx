import { TICKET_STATUS_LABELS, type TicketStatus } from "@sellbridge/shared/schemas";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES: Record<TicketStatus, string> = {
  open: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  answered: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  closed: "border-border bg-muted text-muted-foreground",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONES[status])}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}
