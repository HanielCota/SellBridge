import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from "@sellbridge/shared/schemas";
import { RESPONSE_TARGET_HOURS, responseTiming } from "@sellbridge/shared/ticket-rules";
import type { ReactNode } from "react";
import { type StatusTone, TonePill, ToneStatus } from "@/components/data/tone-status";
import { useNow } from "@/hooks/use-now";
import { formatDuration } from "@/features/support/response-time";
import { ticketTopicLabel } from "@/features/support/ticket-audience";
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

export function TicketPriorityBadge({
  priority,
  focusable = true,
  appearance = "dot",
}: {
  priority: TicketPriority;
  /** False inside a linked row (phone inbox), where the row is the focus stop (PR #64 review). */
  focusable?: boolean;
  /** "pill": the ticket's own header, where the tag also says what it is ("Prioridade alta"). */
  appearance?: "dot" | "pill";
}) {
  const label = TICKET_PRIORITY_LABELS[priority];
  return (
    <HintedText
      focusable={focusable}
      className="inline-flex"
      label={`${label}: responder em até ${RESPONSE_TARGET_HOURS[priority]} h`}
    >
      {appearance === "pill" ? (
        <TonePill tone={PRIORITY_TONES[priority]} label={`Prioridade ${label.toLowerCase()}`} />
      ) : (
        <ToneStatus tone={PRIORITY_TONES[priority]} label={label} />
      )}
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
  focusable,
  appearance,
}: {
  late: boolean;
  tone: keyof typeof DEADLINE_TEXT;
  label: string;
  focusable: boolean;
  appearance: "dot" | "pill";
}) {
  const Icon = late ? ACTION_ICONS.overdue.icon : ACTION_ICONS.deadline.icon;
  const icon = (
    <Icon className="size-3.5 shrink-0" weight={late ? "bold" : "regular"} aria-hidden="true" />
  );
  return (
    <HintedText
      focusable={focusable}
      className="inline-flex"
      label={late ? TERM_HINTS.ticketOverdue : TERM_HINTS.ticketDueIn}
    >
      {appearance === "pill" ? (
        <TonePill tone={tone} label={label} icon={icon} timeBased />
      ) : (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-footnote font-medium whitespace-nowrap",
            DEADLINE_TEXT[tone],
          )}
          suppressHydrationWarning
        >
          {icon}
          {label}
        </span>
      )}
    </HintedText>
  );
}

/** `kind`: name the topic the way that account saw it in the new-ticket form. */
export function TicketCategoryLabel({
  category,
  kind,
  className,
}: {
  category: TicketCategory;
  kind?: ProfileKind;
  className?: string | undefined;
}) {
  return (
    <span className={cn("text-footnote text-muted-foreground", className)}>
      {kind === undefined ? TICKET_CATEGORY_LABELS[category] : ticketTopicLabel(category, kind)}
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

/** Bold for a thread with something new, regular once read: the inbox reads at a glance. */
export function unreadSubjectClass(unread: boolean): string {
  return unread ? "font-semibold" : "font-normal";
}

/**
 * The subject block of a list row with its unread dot in a fixed slot on the left, as in an
 * e-mail inbox. Every row keeps the slot, so dots and subjects line up whatever the gray line
 * under the subject says; screen readers hear the label instead of a dot. `hanging` puts the
 * slot in the cell's left padding, so the subject stays under the column heading.
 */
export function UnreadSubject({
  unread,
  label = "Nova resposta",
  hanging = false,
  children,
}: {
  unread: boolean;
  label?: string;
  hanging?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-1.5", hanging && "-ml-3.5")}>
      {unread ? (
        <span className="relative mt-1.5 size-2 shrink-0 rounded-full bg-brand">
          <span className="sr-only">{label}</span>
        </span>
      ) : (
        <span className="size-2 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

interface TimingProps {
  status: TicketStatus;
  priority: TicketPriority;
  awaitingSince: Date | null;
  /** False inside a linked row, where the row is the focus stop. */
  focusable?: boolean;
  /** "pill": the ticket's own header. */
  appearance?: "dot" | "pill";
}

/** For the team: how long until the answer is due, or how late it already is. */
export function ResponseDeadlineBadge({
  status,
  priority,
  awaitingSince,
  focusable = true,
  appearance = "dot",
}: TimingProps) {
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
        focusable={focusable}
        appearance={appearance}
        late
        tone="danger"
        label={`Atrasado ${formatDuration(timing.lateMilliseconds)}`}
      />
    );
  }
  const tone = timing.remainingMilliseconds < DUE_SOON_MILLISECONDS ? "warning" : "muted";
  return (
    <DeadlineStatus
      focusable={focusable}
      appearance={appearance}
      late={false}
      tone={tone}
      label={`Vence em ${formatDuration(timing.remainingMilliseconds, Math.floor)}`}
    />
  );
}
