import { useRef, useState } from "react";
import { TrackPill } from "@/components/data/track-pill";
import { useActiveIndicator } from "@/components/data/use-active-indicator";
import { cn } from "@/lib/utils";

/**
 * Pill-style segmented filter. The active background is one shared indicator that
 * glides to the pressed option, so the eye follows the change instead of seeing it
 * blink from one button to another. Before the first measure (SSR, hydration) the
 * active button paints its own background.
 */
export function SegmentedControl<TValue extends string>({
  legend,
  options,
  labels,
  counts,
  value,
  onChange,
}: {
  legend: string;
  options: readonly TValue[];
  labels: Record<TValue, string>;
  /** Optional tally beside each label; omitted while it loads. */
  counts?: Partial<Record<TValue, number>> | undefined;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  const containerRef = useRef<HTMLFieldSetElement>(null);
  const buttonRefs = useRef(new Map<TValue, HTMLButtonElement>());
  const indicator = useActiveIndicator(value, containerRef, buttonRefs);
  // Off until the first press, so the indicator lands in place on load instead of
  // sliding in from the left edge.
  const [canAnimate, setCanAnimate] = useState(false);

  return (
    <fieldset
      ref={containerRef}
      className="relative inline-flex h-10 w-fit max-w-full shrink-0 items-center overflow-x-auto rounded-full bg-card p-1 [scrollbar-width:none]"
    >
      <legend className="sr-only">{legend}</legend>
      {indicator ? <TrackPill box={indicator} canAnimate={canAnimate} /> : null}
      {options.map((option) => (
        <button
          key={option}
          ref={(node) => {
            if (!node) {
              buttonRefs.current.delete(option);
              return;
            }
            buttonRefs.current.set(option, node);
          }}
          type="button"
          aria-pressed={option === value}
          onClick={() => {
            setCanAnimate(true);
            onChange(option);
          }}
          className={cn(
            "relative inline-flex h-full shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-[color,transform] duration-300 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] active:duration-100 motion-reduce:active:scale-100",
            option === value ? "text-background" : "text-muted-foreground hover:text-foreground",
            option === value && !indicator && "bg-foreground shadow-sm",
          )}
        >
          {labels[option]}
          {counts?.[option] === undefined ? null : (
            <span className={cn("text-xs tabular-nums", option === value && "opacity-70")}>
              {counts[option]}
            </span>
          )}
        </button>
      ))}
    </fieldset>
  );
}
