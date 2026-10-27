import type { Icon } from "@phosphor-icons/react";
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
  icons,
  stretch = false,
  value,
  onChange,
}: {
  legend: string;
  options: readonly TValue[];
  labels: Record<TValue, string>;
  /** Optional tally beside each label; omitted while it loads. */
  counts?: Partial<Record<TValue, number>> | undefined;
  /** Optional icon before each label. */
  icons?: Partial<Record<TValue, Icon>> | undefined;
  /** Fill the container, options sharing the width (a sheet's full-width switch). */
  stretch?: boolean;
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
    // A fieldset is at least as wide as its content by default; min-w-0 lets it scroll instead.
    <fieldset
      ref={containerRef}
      className={cn(
        "relative inline-flex h-10 max-w-full min-w-0 shrink-0 items-center overflow-x-auto rounded-full bg-card p-1 [scrollbar-width:none]",
        stretch ? "w-full" : "w-fit",
      )}
    >
      <legend className="sr-only">{legend}</legend>
      {indicator ? <TrackPill box={indicator} canAnimate={canAnimate} /> : null}
      {options.map((option) => (
        <SegmentedOption
          key={option}
          isPressed={option === value}
          paintsOwnPill={!indicator}
          stretch={stretch}
          icon={icons?.[option]}
          label={labels[option]}
          count={counts?.[option]}
          buttonRef={(node) => {
            if (!node) {
              buttonRefs.current.delete(option);
              return;
            }
            buttonRefs.current.set(option, node);
          }}
          onPress={() => {
            setCanAnimate(true);
            onChange(option);
          }}
        />
      ))}
    </fieldset>
  );
}

function SegmentedOption({
  isPressed,
  paintsOwnPill,
  stretch,
  icon: OptionIcon,
  label,
  count,
  buttonRef,
  onPress,
}: {
  isPressed: boolean;
  paintsOwnPill: boolean;
  stretch: boolean;
  icon: Icon | undefined;
  label: string;
  count: number | undefined;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onPress: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={isPressed}
      onClick={onPress}
      className={cn(
        "relative inline-flex h-full shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-[color,transform] duration-300 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] active:duration-100 motion-reduce:active:scale-100",
        isPressed ? "text-background" : "text-muted-foreground hover:text-foreground",
        isPressed && paintsOwnPill && "bg-foreground shadow-sm",
        // The phone sheet leaves 256px for two options with icons: px-4 clipped "Fornecedor" at 375px.
        stretch && "flex-1 justify-center px-2",
      )}
    >
      {OptionIcon ? <OptionIcon className="size-4 shrink-0" aria-hidden="true" /> : null}
      {label}
      {count === undefined ? null : (
        <span className={cn("text-xs tabular-nums", isPressed && "opacity-70")}>{count}</span>
      )}
    </button>
  );
}
