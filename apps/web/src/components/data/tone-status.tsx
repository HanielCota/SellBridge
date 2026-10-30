import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

export const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  // The 500 shades are under 3:1 on white; the dark theme keeps them.
  success: "bg-emerald-600 dark:bg-emerald-500",
  warning: "bg-amber-600 dark:bg-amber-500",
  danger: "bg-destructive",
  info: "bg-sky-600 dark:bg-sky-500",
  muted: "bg-muted-foreground/70",
};

/**
 * Status as a colored dot plus its label, so the meaning never depends on color alone.
 * `timeBased` labels ("vence em 40 min") depend on the clock and may differ by a minute
 * between the server render and hydration.
 */
export function ToneStatus({
  tone,
  label,
  timeBased = false,
}: {
  tone: StatusTone;
  label: string;
  timeBased?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-footnote font-medium whitespace-nowrap"
      suppressHydrationWarning={timeBased}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT_CLASSES[tone])}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Tinted background and matching text: dark text on the light tint, light text on the dark. */
const TONE_PILL_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-600/12 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  // The destructive red on its own tint sits at the 4.5:1 limit for small text; darker in light mode.
  danger: "bg-destructive/12 text-red-800 dark:text-destructive",
  info: "bg-sky-600/12 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  muted: "bg-foreground/[0.06] text-muted-foreground",
};

/**
 * Status as a tinted tag, for the places where it is the first thing to read (a ticket's header,
 * a team reply). The dot or icon keeps it readable without color, as in `ToneStatus`.
 */
export function TonePill({
  tone,
  label,
  icon,
  showDot = true,
  timeBased = false,
}: {
  tone: StatusTone;
  label: string;
  /** Drawn in place of the dot. */
  icon?: ReactNode;
  /** False for a neutral tag (the customer kind, the topic) that is not a status. */
  showDot?: boolean;
  /** True for labels that follow the clock ("vence em 40 min"), as in `ToneStatus`. */
  timeBased?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-footnote font-medium whitespace-nowrap",
        TONE_PILL_CLASSES[tone],
      )}
      suppressHydrationWarning={timeBased}
    >
      {icon ?? null}
      {icon === undefined && showDot ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT_CLASSES[tone])}
          aria-hidden="true"
        />
      ) : null}
      {label}
    </span>
  );
}
