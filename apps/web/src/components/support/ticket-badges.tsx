import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@sellbridge/shared/schemas";
import { RESPONSE_TARGET_HOURS, responseTiming } from "@sellbridge/shared/ticket-rules";
import { type StatusTone, ToneStatus } from "@/components/data/tone-status";
import { useNow } from "@/hooks/use-now";
import { formatDuration } from "@/features/support/response-time";
import { cn } from "@/lib/utils";
import { ACTION_ICONS, TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

const PRIORITY_TONES: Record<TicketPriority, StatusTone> = {
  low: "muted",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

/** Less than this left on the clock and the deadline turns amber in the inbox. */
const DUE_SOON_MILLISECONDS = 60 * 60_000;

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  const label = TICKET_PRIORITY_LABELS[priority];
  return (
    <HintedText
      className="inline-flex"
      label={`${label}: responder em até ${RESPONSE_TARGET_HOURS[priority]} h`}
    >
      <ToneStatus tone={PRIORITY_TONES[priority]} label={label} />
    </HintedText>
  );
}

const DEADLINE_TEXT: Record<"danger" | "warning" | "muted", string> = {
  danger: "text-destructive",
  warning: "text-amber-700 dark:text-amber-400",
  muted: "text-muted-foreground",
};

/** The answer deadline with the app's clocks, the same pair the orders use (admin section 3a). */
function DeadlineStatus({
  late,
  tone,
  label,
}: {
  late: boolean;
  tone: keyof typeof DEADLINE_TEXT;
  label: string;
}) {
  const Icon = late ? ACTION_ICONS.overdue.icon : ACTION_ICONS.deadline.icon;
  return (
    <HintedText
      className="inline-flex"
      label={late ? TERM_HINTS.ticketOverdue : TERM_HINTS.ticketDueIn}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-footnote font-medium whitespace-nowrap",
          DEADLINE_TEXT[tone],
        )}
        suppressHydrationWarning
      >
        <Icon className="size-3.5 shrink-0" weight={late ? "bold" : "regular"} aria-hidden="true" />
        {label}
      </span>
    </HintedText>
  );
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
      <DeadlineStatus
        late
        tone="danger"
        label={`Atrasado ${formatDuration(timing.lateMilliseconds)}`}
      />
    );
  }
  const tone = timing.remainingMilliseconds < DUE_SOON_MILLISECONDS ? "warning" : "muted";
  return (
    <DeadlineStatus
      late={false}
      tone={tone}
      label={`Vence em ${formatDuration(timing.remainingMilliseconds)}`}
    />
  );
}
