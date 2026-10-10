import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

const DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
  muted: "bg-muted-foreground/50",
};

/** Status as a colored dot plus its label, so the meaning never depends on color alone. */
export function ToneStatus({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-footnote font-medium whitespace-nowrap">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASSES[tone])}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
