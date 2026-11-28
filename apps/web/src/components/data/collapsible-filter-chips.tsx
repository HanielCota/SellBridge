import { CaretDownIcon } from "@phosphor-icons/react";
import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FilterTab } from "./filter-tabs";

/** How the chips show: only the first row with a toggle, or every row. */
export type ChipListView = { kind: "all"; canCollapse: boolean } | { kind: "firstRow" };

/**
 * Collapsed keeps only the first row, unless the chosen chip sits past it: the list then stays
 * open, so the choice is always in sight.
 */
export function chipListView({
  expanded,
  chosenIndex,
  firstRowCount,
}: {
  expanded: boolean;
  chosenIndex: number;
  firstRowCount: number;
}): ChipListView {
  const chosenHidden = chosenIndex >= firstRowCount;
  if (expanded || chosenHidden) return { kind: "all", canCollapse: !chosenHidden };
  return { kind: "firstRow" };
}

/** Same timing as the other expanding panels (the grouped orders in the statement). */
const EXPAND_TRANSITION =
  "transition-[max-height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

/** One chip row plus the 0.25rem room kept on each side for the focus ring. */
const COLLAPSED_MAX_HEIGHT = "3.25rem";

/**
 * How many chips sit on the first row, whether there is more than one row, and the full height in
 * pixels the list grows to when open.
 */
function useFirstRow(list: RefObject<HTMLDivElement | null>) {
  const [firstRow, setFirstRow] = useState({
    count: Number.POSITIVE_INFINITY,
    wraps: false,
    fullHeightInPx: 0,
  });
  useLayoutEffect(() => {
    const element = list.current;
    if (element === null) return undefined;
    function measure(container: HTMLDivElement) {
      const chips = [...container.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      const top = chips[0]?.offsetTop ?? 0;
      const count = chips.filter((chip) => chip.offsetTop === top).length;
      const fullHeightInPx = container.scrollHeight;
      setFirstRow((previous) =>
        previous.count === count &&
        previous.wraps === count < chips.length &&
        previous.fullHeightInPx === fullHeightInPx
          ? previous
          : { count, wraps: count < chips.length, fullHeightInPx },
      );
    }
    measure(element);
    // Re-measured when the box resizes and when the chips themselves change.
    const resize = new ResizeObserver(() => measure(element));
    const chipsChange = new MutationObserver(() => measure(element));
    resize.observe(element);
    chipsChange.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      chipsChange.disconnect();
    };
  }, [list]);
  return firstRow;
}

const CHIP_CLASSES =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

interface CollapsibleFilterChipsProps<TValue> {
  legend: string;
  tabs: readonly FilterTab<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  /** Toggle text while collapsed, given how many chips are out of sight. */
  moreLabel: (hiddenCount: number) => string;
}

/**
 * Filter chips that wrap instead of scrolling sideways: collapsed to the first row with a "more"
 * toggle, so a long list never hides options behind a horizontal scroll.
 */
export function CollapsibleFilterChips<TValue>({
  legend,
  tabs,
  value,
  onChange,
  moreLabel,
}: CollapsibleFilterChipsProps<TValue>) {
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const firstRow = useFirstRow(list);
  const view = chipListView({
    expanded,
    chosenIndex: tabs.findIndex((tab) => tab.value === value),
    firstRowCount: firstRow.count,
  });
  const collapsed = view.kind === "firstRow";
  return (
    <fieldset className="flex min-w-0 flex-col items-start gap-2 sm:flex-row">
      <legend className="sr-only">{legend}</legend>
      {/* Always clipped so the height can animate; the padding keeps the focus ring inside. */}
      <div
        ref={list}
        id={listId}
        style={{
          maxHeight: collapsed ? COLLAPSED_MAX_HEIGHT : `${firstRow.fullHeightInPx}px`,
        }}
        className={cn(
          "-m-1 flex w-[calc(100%+0.5rem)] min-w-0 flex-1 flex-wrap gap-2 overflow-hidden p-1 sm:w-auto",
          EXPAND_TRANSITION,
        )}
      >
        {tabs.map((tab, index) => (
          <FilterChip
            key={tab.label}
            tab={tab}
            active={tab.value === value}
            outOfSight={collapsed && index >= firstRow.count}
            onPick={() => onChange(tab.value)}
          />
        ))}
      </div>
      <ChipListToggle
        view={view}
        wraps={firstRow.wraps}
        hiddenCount={tabs.length - firstRow.count}
        listId={listId}
        moreLabel={moreLabel}
        onToggle={() => setExpanded(collapsed)}
      />
    </fieldset>
  );
}

function FilterChip<TValue>({
  tab,
  active,
  outOfSight,
  onPick,
}: {
  tab: FilterTab<TValue>;
  active: boolean;
  outOfSight: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-hidden={outOfSight || undefined}
      tabIndex={outOfSight ? -1 : undefined}
      onClick={onPick}
      className={cn(
        CHIP_CLASSES,
        active
          ? "bg-selected text-selected-foreground"
          : "bg-muted text-foreground hover:bg-foreground/10",
      )}
    >
      {tab.label}
      {tab.count === undefined ? null : (
        <span className="text-xs tabular-nums opacity-75">{tab.count}</span>
      )}
    </button>
  );
}

function ChipListToggle({
  view,
  wraps,
  hiddenCount,
  listId,
  moreLabel,
  onToggle,
}: {
  view: ChipListView;
  wraps: boolean;
  hiddenCount: number;
  listId: string;
  moreLabel: (hiddenCount: number) => string;
  onToggle: () => void;
}) {
  if (!wraps) return null;
  if (view.kind === "all" && !view.canCollapse) return null;
  const collapsed = view.kind === "firstRow";
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 shrink-0 rounded-full px-4"
      aria-expanded={!collapsed}
      aria-controls={listId}
      onClick={onToggle}
    >
      {collapsed ? moreLabel(hiddenCount) : "Mostrar menos"}
      <CaretDownIcon
        aria-hidden="true"
        className={cn(
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          !collapsed && "rotate-180",
        )}
      />
    </Button>
  );
}
