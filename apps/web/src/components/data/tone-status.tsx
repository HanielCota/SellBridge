import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

export const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
  muted: "bg-muted-foreground/50",
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
