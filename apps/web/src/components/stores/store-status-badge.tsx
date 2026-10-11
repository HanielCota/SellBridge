import { STORE_STATUS_LABELS, type StoreStatus } from "@sellbridge/shared/schemas";
import { type StatusTone, TONE_DOT_CLASSES, ToneStatus } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";

const STORE_TONES: Record<StoreStatus, StatusTone> = {
  connected: "success",
  expired: "warning",
  error: "danger",
  disconnected: "muted",
};

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  return <ToneStatus tone={STORE_TONES[status]} label={STORE_STATUS_LABELS[status]} />;
}

const TONE_CHIP_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500/14 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground",
};

/** The status as a tinted pill, for headers where the dot alone would be too quiet. */
export function StoreStatusChip({ status }: { status: StoreStatus }) {
  const tone = STORE_TONES[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        TONE_CHIP_CLASSES[tone],
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONE_DOT_CLASSES[tone])} />
      {STORE_STATUS_LABELS[status]}
    </span>
  );
}

/** The status as a dot pinned to a store's mark, with its label kept for screen readers. */
export function StoreStatusDot({ status, className }: { status: StoreStatus; className?: string }) {
  return (
    <span
      title={STORE_STATUS_LABELS[status]}
      className={cn(
        "size-3 rounded-full ring-[2.5px] ring-card",
        TONE_DOT_CLASSES[STORE_TONES[status]],
        className,
      )}
    >
      <span className="sr-only">{STORE_STATUS_LABELS[status]}</span>
    </span>
  );
}
