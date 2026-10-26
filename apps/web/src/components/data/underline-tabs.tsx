import { cn } from "@/lib/utils";
import type { FilterTab } from "./filter-tabs";

/**
 * The page's own sections ("Operação · Avaliações · Rastreio") as underlined tabs, so they never
 * read as a second copy of the filters below them, which keep the pill track or chips.
 */
export function UnderlineTabs<TValue>({
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
  return (
    // A fieldset is at least as wide as its content by default; min-w-0 lets it scroll instead.
    <fieldset className="flex max-w-full min-w-0 gap-6 overflow-x-auto border-b border-border [scrollbar-width:none]">
      <legend className="sr-only">{legend}</legend>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 pt-1 pb-2.5 text-[0.9375rem] font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count === undefined ? null : (
              <span className="text-xs text-muted-foreground tabular-nums">{tab.count}</span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
