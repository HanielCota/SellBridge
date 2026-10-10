import { TICKET_STATUS_LABELS, type TicketStatus } from "@sellbridge/shared/schemas";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";

const TONES: Record<TicketStatus, StatusTone> = {
  open: "warning",
  answered: "info",
  closed: "muted",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <ToneStatus tone={TONES[status]} label={TICKET_STATUS_LABELS[status]} />;
}
