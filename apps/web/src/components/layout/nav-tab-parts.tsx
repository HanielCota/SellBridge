import { cn } from "@/lib/utils";

/** Shared look of a header tab, whether it is a link or the profile menu's trigger. */
export function navTabClassName({
  isActive,
  paintsOwnPill,
  padding,
}: {
  isActive: boolean;
  paintsOwnPill: boolean;
  padding: string;
}): string {
  return cn(
    "relative flex h-10 items-center gap-2 rounded-full text-base whitespace-nowrap transition-[background-color,color,scale] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100",
    isActive
      ? "font-medium text-background"
      : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
    isActive && paintsOwnPill && "bg-foreground",
    padding,
  );
}

/** Count beside a tab label; screen readers hear what it counts instead of the bare number. */
export function TabBadge({
  isError,
  count,
  description,
}: {
  isError: boolean;
  count: number;
  description: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption font-semibold tabular-nums",
          isError ? "bg-destructive/15 text-destructive" : "bg-brand/20 text-brand-text",
        )}
      >
        {count}
      </span>
      <span className="sr-only">, {description}</span>
    </>
  );
}
