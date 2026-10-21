import { STORE_STATUS_LABELS } from "@sellbridge/shared/schemas";
import { STORE_ATTENTION_LABEL, type StoreHealth } from "@sellbridge/shared/store-attention";
import { type StatusTone, TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";

const STORE_TONES: Record<StoreHealth, StatusTone> = {
  connected: "success",
  attention: "warning",
  expired: "warning",
  error: "danger",
  disconnected: "muted",
};

const TONE_CHIP_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500/14 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground",
};

function healthLabel(status: StoreHealth): string {
  if (status === "attention") {
    return STORE_ATTENTION_LABEL;
  }
  return STORE_STATUS_LABELS[status];
}

/** The status as a tinted pill, for headers where the dot alone would be too quiet. */
export function StoreStatusChip({ status }: { status: StoreHealth }) {
  const tone = STORE_TONES[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        TONE_CHIP_CLASSES[tone],
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", TONE_DOT_CLASSES[tone])} />
      {healthLabel(status)}
    </span>
  );
}

/** The status as a dot pinned to a store's mark, with its label kept for screen readers. */
export function StoreStatusDot({ status, className }: { status: StoreHealth; className?: string }) {
  return (
    // The app's legend instead of a native title: it shows in the theme, on hover and on tap.
    <Hint label={healthLabel(status)}>
      <span
        className={cn(
          "size-3 rounded-full ring-[2.5px] ring-card",
          TONE_DOT_CLASSES[STORE_TONES[status]],
          className,
        )}
      >
        <span className="sr-only">{healthLabel(status)}</span>
      </span>
    </Hint>
  );
}
