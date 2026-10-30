import { cn } from "@/lib/utils";

/**
 * A filter as chips after a visible "Mostrar": under the page's underlined tabs it reads as a
 * choice of what to list, not as another row of tabs.
 */
export function ChoiceChips<TValue extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
}: {
  /** What screen readers hear for the group ("Filtrar pedidos"). */
  legend: string;
  options: readonly TValue[];
  labels: Record<TValue, string>;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <fieldset className="flex max-w-full min-w-0 shrink-0 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
      <legend className="sr-only">{legend}</legend>
      <span className="shrink-0 text-sm text-muted-foreground" aria-hidden="true">
        Mostrar
      </span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
            option === value
              ? "border-foreground bg-foreground text-background"
              : "border-border text-foreground hover:bg-foreground/[0.06]",
          )}
        >
          {labels[option]}
        </button>
      ))}
    </fieldset>
  );
}
