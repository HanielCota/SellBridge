import { cn } from "@/lib/utils";

const BADGE_TONES = {
  success: "bg-emerald-700 text-white",
  warning: "bg-amber-700 text-white",
  danger: "bg-destructive text-white",
} as const;

/** A solid status pill with its word, the same wherever the Bling import shows a state. */
export function BlingBadge({
  tone,
  children,
}: {
  tone: keyof typeof BADGE_TONES;
  children: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
