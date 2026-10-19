import {
  countdownLabel,
  type QueueDeadline,
  type QueueUrgency,
  urgencyFor,
} from "@sellbridge/shared/supplier-panel-orders";
import { cn } from "@/lib/utils";
import { ACTION_ICONS, TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

/** Pill per urgency; the icon and the words carry the meaning, the color only reinforces it. */
const URGENCY_CLASSES: Record<QueueUrgency, string> = {
  overdue: "bg-destructive text-white",
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  normal: "bg-muted text-muted-foreground",
};

const OverdueIcon = ACTION_ICONS.overdue.icon;
const DeadlineClockIcon = ACTION_ICONS.deadline.icon;

/** Late deadlines show the countdown clock, as on the reseller's orders; open ones a plain clock. */
export function DeadlineIcon({ urgency, className }: { urgency: QueueUrgency; className: string }) {
  if (urgency === "overdue") {
    return <OverdueIcon className={className} weight="bold" aria-hidden="true" />;
  }
  return <DeadlineClockIcon className={className} weight="bold" aria-hidden="true" />;
}

/** The time left, read again against the clock so it counts down while the page stays open. */
export function liveUrgency(deadline: QueueDeadline | null, now: Date) {
  const remainingMilliseconds = deadline === null ? null : deadline.at.getTime() - now.getTime();
  return {
    urgency: urgencyFor(remainingMilliseconds),
    label: countdownLabel({ deadline, remainingMilliseconds }),
  };
}

/** "Aceite em 1 h 20 min" or "Despacho atrasado há 3 h", in the deadline's urgency. */
export function CountdownBadge({
  deadline,
  now,
  className,
  focusable = true,
}: {
  deadline: QueueDeadline | null;
  now: Date;
  className?: string;
  /** False inside a control (a row button), where the legend opens on hover or tap only. */
  focusable?: boolean;
}) {
  const { urgency, label } = liveUrgency(deadline, now);
  return (
    <HintedText
      label={urgency === "overdue" ? TERM_HINTS.overdueDeadline : TERM_HINTS.openDeadline}
      focusable={focusable}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-footnote font-semibold whitespace-nowrap tabular-nums",
          URGENCY_CLASSES[urgency],
          className,
        )}
        // The label follows the clock: the server render and hydration may differ by a minute.
        suppressHydrationWarning
      >
        <DeadlineIcon urgency={urgency} className="size-3.5 shrink-0" />
        {label}
      </span>
    </HintedText>
  );
}
