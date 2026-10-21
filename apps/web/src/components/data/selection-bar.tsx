import type { ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const ClearIcon = ACTION_ICONS.clearSelection.icon;

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
        "sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mx-auto flex w-fit items-center gap-1 rounded-full bg-card p-1.5 shadow-lg ring-1 shadow-black/20 ring-border",
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
      <Hint label={ACTION_ICONS.clearSelection.hint} openOnTap={false}>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Limpar seleção"
          // On phones the word pushed the bar past a 390px screen; the X and its hint stand alone there.
          className="text-muted-foreground hover:text-foreground max-sm:size-8 max-sm:px-0"
          onClick={onClear}
        >
          <ClearIcon aria-hidden="true" />
          <span aria-hidden="true" className="hidden sm:inline">
            Limpar
          </span>
        </Button>
      </Hint>
    </section>
  );
}
