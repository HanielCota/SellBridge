import { cn } from "@/lib/utils";

export type ComposerMode = "reply" | "note";

const MODES: readonly { value: ComposerMode; label: string }[] = [
  { value: "reply", label: "Responder ao cliente" },
  { value: "note", label: "Nota interna" },
];

/**
 * Who reads what is typed, spelled out above the box. A lock icon alone let agents send team
 * notes to the customer (or save a note believing they had answered), and that can't be undone.
 */
export function ComposerModeSwitch({
  mode,
  onChange,
}: {
  mode: ComposerMode;
  onChange: (mode: ComposerMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-1">
      <fieldset className="inline-flex rounded-full bg-muted p-0.5">
        <legend className="sr-only">Quem vai ler</legend>
        {MODES.map((option) => {
          const isActive = option.value === mode;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              className={cn(
                "h-8 rounded-full px-3 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40",
                isActive
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground [@media(hover:hover)]:hover:text-foreground",
                isActive && option.value === "note" && "text-amber-700 dark:text-amber-400",
              )}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>
      <span
        className={cn(
          "text-xs",
          mode === "note" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {mode === "note" ? "Só a equipe vê." : "O cliente vê esta mensagem."}
      </span>
    </div>
  );
}
