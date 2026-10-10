import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Floating pill shown while items are selected: how many, the bulk actions and a clear button. */
export function SelectionBar({
  label,
  count,
  summary,
  onClear,
  className,
  children,
}: {
  label: string;
  count: number;
  summary: string;
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
        "sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-full bg-foreground py-2 pr-2 pl-5 text-background shadow-lg shadow-black/20",
        className,
      )}
    >
      <p className="mr-2 text-sm font-medium">{summary}</p>
      {children}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Limpar seleção"
        className="text-background hover:bg-background/10 hover:text-background"
        onClick={onClear}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </section>
  );
}
