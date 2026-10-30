import { TICKET_STATUS_LABELS, type TicketStatus } from "@sellbridge/shared/schemas";
import { type StatusTone, TonePill, ToneStatus } from "@/components/data/tone-status";

const TONES: Record<TicketStatus, StatusTone> = {
  open: "warning",
  answered: "info",
  closed: "muted",
};

/** `labels`: the team's words by default; customer screens pass their own. */
export function TicketStatusBadge({
  status,
  labels = TICKET_STATUS_LABELS,
  appearance = "dot",
}: {
  status: TicketStatus;
  labels?: Record<TicketStatus, string>;
  /** "pill": the tinted tag of the ticket's own header; lists keep the lighter dot. */
  appearance?: "dot" | "pill";
}) {
  if (appearance === "pill") {
    return <TonePill tone={TONES[status]} label={labels[status]} />;
  }
  return <ToneStatus tone={TONES[status]} label={labels[status]} />;
}
