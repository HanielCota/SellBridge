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
