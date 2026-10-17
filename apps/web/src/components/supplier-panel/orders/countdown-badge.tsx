import {
  countdownLabel,
  type QueueDeadline,
  type QueueUrgency,
  urgencyFor,
} from "@sellbridge/shared/supplier-panel-orders";
import { ClockIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** Pill per urgency; the icon and the words carry the meaning, the color only reinforces it. */
const URGENCY_CLASSES: Record<QueueUrgency, string> = {
  overdue: "bg-destructive text-white",
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  normal: "bg-muted text-muted-foreground",
};

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
}: {
  deadline: QueueDeadline | null;
  now: Date;
  className?: string;
}) {
  const { urgency, label } = liveUrgency(deadline, now);
  const Icon = urgency === "overdue" || urgency === "danger" ? WarningCircleIcon : ClockIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-footnote font-semibold whitespace-nowrap tabular-nums",
        URGENCY_CLASSES[urgency],
        className,
      )}
      // The label follows the clock: the server render and hydration may differ by a minute.
      suppressHydrationWarning
    >
      <Icon className="size-3.5 shrink-0" weight="bold" aria-hidden="true" />
      {label}
    </span>
  );
}
