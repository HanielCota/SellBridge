import { useRef, useState } from "react";
import { useActiveIndicator } from "@/components/data/use-active-indicator";
import {
  TRACK_CLASSES,
  TRACK_FALLBACK_PILL_CLASSES,
  TRACK_OPTION_CLASSES,
  TrackPill,
} from "@/components/data/track-pill";
import { useOptimisticChoice } from "@/hooks/use-optimistic-choice";
import { cn } from "@/lib/utils";

export interface FilterTab<TValue> {
  value: TValue;
  label: string;
  count?: number | undefined;
}

/** The optional count beside a tab's label, dimmed to match the pill under it. */
function TabCount({ count, active }: { count: number | undefined; active: boolean }) {
  if (count === undefined) {
    return null;
  }
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        active ? "text-background/75" : "text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

/**
 * Filter tabs on a muted track, like the period control: the chosen tab is a pill cut out of
 * the track that glides to the next pick, optionally with a count beside each label.
 */
export function FilterTabs<TValue>({
  legend,
  tabs,
  value,
  onChange,
}: {
  legend: string;
  tabs: readonly FilterTab<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  const chosen = useOptimisticChoice(value);
  const containerRef = useRef<HTMLFieldSetElement>(null);
  const tabRefs = useRef(new Map<TValue, HTMLElement>());
  const indicator = useActiveIndicator(chosen.value, containerRef, tabRefs);
  // Off until the first pick, so the pill lands in place on load instead of sliding in.
  const [canAnimate, setCanAnimate] = useState(false);
  return (
    <fieldset ref={containerRef} className={cn(TRACK_CLASSES, "inline-flex w-fit max-w-full")}>
      <legend className="sr-only">{legend}</legend>
      {indicator ? <TrackPill box={indicator} canAnimate={canAnimate} /> : null}
      {tabs.map((tab) => {
        const active = tab.value === chosen.value;
        return (
          <button
            key={tab.label}
            ref={(node) => {
              if (!node) {
                tabRefs.current.delete(tab.value);
                return;
              }
              tabRefs.current.set(tab.value, node);
            }}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setCanAnimate(true);
              chosen.choose(tab.value);
              onChange(tab.value);
            }}
            className={cn(
              TRACK_OPTION_CLASSES,
              "px-3.5 focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "text-background hover:text-background" : "hover:bg-foreground/[0.06]",
              active && !indicator && TRACK_FALLBACK_PILL_CLASSES,
            )}
          >
            {tab.label}
            <TabCount count={tab.count} active={active} />
          </button>
        );
      })}
    </fieldset>
  );
}
