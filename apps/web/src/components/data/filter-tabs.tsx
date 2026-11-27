import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useRef, useState, type RefObject } from "react";
import { useActiveIndicator } from "@/components/data/use-active-indicator";
import {
  scrollEdgeMask,
  useScrollEdges,
  type ScrollEdges,
} from "@/components/data/use-scroll-edges";
import {
  TRACK_CLASSES,
  TRACK_FALLBACK_PILL_CLASSES,
  TRACK_OPTION_CLASSES,
  TrackPill,
} from "@/components/data/track-pill";
import { useOptimisticChoice } from "@/hooks/use-optimistic-choice";
import { Button } from "@/components/ui/button";
import { prefersReducedMotion } from "@/lib/rewind";
import { cn } from "@/lib/utils";

export interface FilterTab<TValue> {
  value: TValue;
  label: string;
  count?: number | undefined;
}

const ACTIVE_TAB_CLASSES = "text-selected-foreground hover:text-selected-foreground";

function FilterScrollButtons({
  track,
  edges,
  labels,
}: {
  track: RefObject<HTMLFieldSetElement | null>;
  edges: ScrollEdges;
  labels: { left: string; right: string };
}) {
  if (!edges.start && !edges.end) return null;

  return (
    <div dir="ltr" className="flex shrink-0 gap-1">
      {[
        { icon: CaretLeftIcon, label: labels.left, direction: -1, enabled: edges.start },
        { icon: CaretRightIcon, label: labels.right, direction: 1, enabled: edges.end },
      ].map(({ icon: Icon, label, direction, enabled }) => (
        <Button
          key={label}
          variant="outline"
          size="icon"
          aria-label={label}
          aria-disabled={!enabled}
          className="aria-disabled:opacity-45"
          onClick={() => {
            const scroller = track.current;
            if (!enabled || scroller === null) return;
            scroller.scrollBy({
              left: direction * scroller.clientWidth * 0.75,
              behavior: prefersReducedMotion() ? "instant" : "smooth",
            });
          }}
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
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
        active ? "text-selected-foreground/75" : "text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

interface FilterTabsProps<TValue> {
  legend: string;
  tabs: readonly FilterTab<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  scrollLabels?: { left: string; right: string };
}

interface FilterTabButtonProps<TValue> {
  tab: FilterTab<TValue>;
  active: boolean;
  noIndicator: boolean;
  register: (node: HTMLElement | null) => void;
  onPick: () => void;
}

function FilterTabButton<TValue>({
  tab,
  active,
  noIndicator,
  register,
  onPick,
}: FilterTabButtonProps<TValue>) {
  return (
    <button
      ref={register}
      type="button"
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        TRACK_OPTION_CLASSES,
        "px-3.5 focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? ACTIVE_TAB_CLASSES : "hover:bg-foreground/[0.06]",
        active && noIndicator && TRACK_FALLBACK_PILL_CLASSES,
      )}
    >
      {tab.label}
      <TabCount count={tab.count} active={active} />
    </button>
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
  scrollLabels,
}: FilterTabsProps<TValue>) {
  const chosen = useOptimisticChoice(value);
  const containerRef = useRef<HTMLFieldSetElement>(null);
  const tabRefs = useRef(new Map<TValue, HTMLElement>());
  const indicator = useActiveIndicator(chosen.value, containerRef, tabRefs);
  const edges = useScrollEdges(containerRef);
  const mask = scrollLabels ? undefined : scrollEdgeMask(edges);
  const [canAnimate, setCanAnimate] = useState(false);
  const track = (
    <fieldset
      ref={containerRef}
      className={cn(TRACK_CLASSES, "inline-flex w-fit max-w-full min-w-0")}
      style={mask === undefined ? undefined : { maskImage: mask }}
    >
      <legend className="sr-only">{legend}</legend>
      {/* Inserting the pill during hydration resets the fieldset's horizontal scroll in Chromium. */}
      <TrackPill box={indicator} canAnimate={canAnimate} />
      {tabs.map((tab) => (
        <FilterTabButton
          key={tab.label}
          tab={tab}
          active={tab.value === chosen.value}
          noIndicator={!indicator}
          register={(node) => {
            if (node === null) tabRefs.current.delete(tab.value);
            if (node !== null) tabRefs.current.set(tab.value, node);
          }}
          onPick={() => {
            setCanAnimate(true);
            chosen.choose(tab.value);
            onChange(tab.value);
          }}
        />
      ))}
    </fieldset>
  );
  if (!scrollLabels) return track;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {track}
      <FilterScrollButtons track={containerRef} edges={edges} labels={scrollLabels} />
    </div>
  );
}
