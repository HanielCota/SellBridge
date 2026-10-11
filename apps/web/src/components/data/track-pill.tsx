import type { IndicatorBox } from "@/components/data/use-active-indicator";
import { cn } from "@/lib/utils";

/**
 * The chosen option's lit pill on a muted track, like the active tab in the top nav. One shared pill glides to the new option,
 * so the eye follows the change instead of seeing it blink from one option to another.
 */
export function TrackPill({
  box,
  canAnimate,
  className,
}: {
  box: IndicatorBox;
  canAnimate: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-y-1 left-0 rounded-full bg-foreground shadow-sm",
        canAnimate &&
          "transition-[transform,width] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
        className,
      )}
      style={{ transform: `translateX(${box.left}px)`, width: box.width }}
    />
  );
}

/** Option classes shared by the track controls: quiet text, a faint hover pill, a press. */
export const TRACK_OPTION_CLASSES =
  "relative flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full text-xs font-medium whitespace-nowrap text-muted-foreground transition-[background-color,color,scale] duration-150 outline-none select-none hover:text-foreground active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100 sm:text-sm";

/** Until the first measure (SSR, hydration) the chosen option paints its own pill. */
export const TRACK_FALLBACK_PILL_CLASSES = "bg-foreground shadow-sm";

export const TRACK_CLASSES =
  "relative flex h-10 min-w-0 items-center gap-0.5 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none]";
