import { Button } from "@/components/ui/button";

/**
 * Under the latest support answer: one tap closes the ticket (with a few seconds to undo), the
 * other tells support at once that it is not solved, so the ticket never sits answered and
 * closes on its own while the customer thinks they replied.
 */
export function ResolvedPrompt({
  isBusy,
  onSolved,
  onNotSolved,
}: {
  isBusy: boolean;
  onSolved: () => void;
  onNotSolved: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3 print:hidden">
      <p className="text-sm font-medium">Isso resolveu seu problema?</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={isBusy} onClick={onSolved}>
          Sim, resolveu
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={onNotSolved}>
          Não
        </Button>
      </div>
    </div>
  );
}
