import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@sellbridge/shared/schemas";
import { responseTiming } from "@sellbridge/shared/ticket-rules";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";
import { useNow } from "@/hooks/use-now";
import { formatDuration } from "@/features/support/response-time";
import { cn } from "@/lib/utils";

const PRIORITY_TONES: Record<TicketPriority, StatusTone> = {
  low: "muted",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

/** Less than this left on the clock and the deadline turns amber in the inbox. */
const DUE_SOON_MILLISECONDS = 60 * 60_000;

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return <ToneStatus tone={PRIORITY_TONES[priority]} label={TICKET_PRIORITY_LABELS[priority]} />;
}

export function TicketCategoryLabel({
  category,
  className,
}: {
  category: TicketCategory;
  className?: string;
}) {
  return (
    <span className={cn("text-footnote text-muted-foreground", className)}>
      {TICKET_CATEGORY_LABELS[category]}
    </span>
  );
}

/** "Nova resposta": the other side wrote since you last opened the thread. */
export function UnreadDot({ label = "Nova resposta" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-footnote font-medium whitespace-nowrap text-brand-text">
      <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
      {label}
    </span>
  );
}

interface TimingProps {
  status: TicketStatus;
  priority: TicketPriority;
  awaitingSince: Date | null;
}

/** For the team: how long until the answer is due, or how late it already is. */
export function ResponseDeadlineBadge({ status, priority, awaitingSince }: TimingProps) {
  const now = useNow();
  if (status !== "open") {
    return null;
  }
  const timing = responseTiming(awaitingSince, priority, now);
  if (timing.state === "none") {
    return null;
  }
  if (timing.state === "overdue") {
    return (
      <ToneStatus
        tone="danger"
        label={`Atrasado ${formatDuration(timing.lateMilliseconds)}`}
        timeBased
      />
    );
  }
  const tone = timing.remainingMilliseconds < DUE_SOON_MILLISECONDS ? "warning" : "muted";
  return (
    <ToneStatus
      tone={tone}
      label={`Vence em ${formatDuration(timing.remainingMilliseconds, Math.floor)}`}
      timeBased
    />
  );
}
