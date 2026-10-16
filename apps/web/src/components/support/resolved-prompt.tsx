import { ThumbsDownIcon, ThumbsUpIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Under the latest support answer: one tap closes the ticket (and opens the rating), or starts
 * a reply saying it is not solved yet.
 */
export function ResolvedPrompt({
  isClosing,
  onSolved,
  onNotSolved,
}: {
  isClosing: boolean;
  onSolved: () => void;
  onNotSolved: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-primary/20 pt-2.5 print:hidden">
      <span className="text-xs text-muted-foreground">Isso resolveu?</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        disabled={isClosing}
        aria-busy={isClosing}
        onClick={onSolved}
      >
        <ThumbsUpIcon aria-hidden="true" />
        {isClosing ? "Encerrando…" : "Sim, resolveu"}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onNotSolved}>
        <ThumbsDownIcon aria-hidden="true" />
        Ainda não
      </Button>
    </div>
  );
}
