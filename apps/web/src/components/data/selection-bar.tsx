import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Floating pill shown while items are selected: how many, the bulk actions and a clear button. */
export function SelectionBar({
  label,
  count,
  countLabel,
  onClear,
  className,
  children,
}: {
  label: string;
  count: number;
  countLabel: { one: string; other: string };
  onClear: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (count === 0) {
    return null;
  }
  return (
    <section
      aria-label={label}
      className={cn(
        "sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-1 rounded-full bg-card p-1.5 shadow-lg ring-1 shadow-black/20 ring-border",
        className,
      )}
    >
      <p className="flex items-center gap-2 pr-3 pl-1.5 text-sm font-medium" aria-live="polite">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
          {count}
        </span>
        {count === 1 ? countLabel.one : countLabel.other}
      </p>
      {children}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Limpar seleção"
        className="text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </section>
  );
}
