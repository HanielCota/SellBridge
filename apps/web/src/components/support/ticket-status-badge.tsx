import { TICKET_STATUS_LABELS, type TicketStatus } from "@sellbridge/shared/schemas";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";

const TONES: Record<TicketStatus, StatusTone> = {
  open: "warning",
  answered: "info",
  closed: "muted",
};

/** `labels`: the team's words by default; customer screens pass their own. */
export function TicketStatusBadge({
  status,
  labels = TICKET_STATUS_LABELS,
}: {
  status: TicketStatus;
  labels?: Record<TicketStatus, string>;
}) {
  return <ToneStatus tone={TONES[status]} label={labels[status]} />;
}
