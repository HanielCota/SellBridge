import { ACTION_ICONS, NAV_TAB_ICONS, type ActionIcon } from "@/components/icons/action-icons";
import { cn } from "@/lib/utils";

/** The icon and hint of the function behind a tab's route, if that area has one. */
export function navTabAction(to: string): ActionIcon | undefined {
  const name = NAV_TAB_ICONS[to];
  if (name === undefined) {
    return undefined;
  }
  return ACTION_ICONS[name];
}

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

function badgeColors({ isError, onActive }: { isError: boolean; onActive: boolean }): string {
  if (onActive) {
    return "bg-background text-foreground";
  }
  return isError ? "bg-destructive/15 text-destructive" : "bg-brand/20 text-brand-text";
}

/** Count beside a tab label; screen readers hear what it counts instead of the bare number. */
export function TabBadge({
  isError,
  count,
  description,
  onActive = false,
}: {
  isError: boolean;
  count: number;
  description: string;
  /** On the lit item's dark pill, the brand green on black was nearly invisible. */
  onActive?: boolean;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption font-semibold tabular-nums",
          badgeColors({ isError, onActive }),
        )}
      >
        {count}
      </span>
      <span className="sr-only">, {description}</span>
    </>
  );
}
