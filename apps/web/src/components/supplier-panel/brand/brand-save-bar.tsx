import { PendingSubmitButton } from "@/components/form/form-feedback";
import { Button } from "@/components/ui/button";

interface BrandSaveBarProps {
  isPending: boolean;
  onDiscard: () => void;
}

/**
 * Floats at the bottom only while there are unsaved changes, so saving never needs a scroll.
 * Below `lg` it sits above the floating support button instead of covering it.
 */
export function BrandSaveBar({ isPending, onDiscard }: BrandSaveBarProps) {
  return (
    <section
      aria-label="Alterações não salvas"
      className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex w-fit max-w-full items-center gap-3 rounded-full bg-popover py-2 pr-2 pl-5 shadow-lg ring-1 ring-border lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <p className="text-sm font-medium">
        <span className="max-sm:hidden">Você tem alterações não salvas</span>
        <span className="sm:hidden">Alterações não salvas</span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="secondary" disabled={isPending} onClick={onDiscard}>
          Descartar
        </Button>
        <PendingSubmitButton isPending={isPending} idleLabel="Salvar" pendingLabel="Salvando…" />
      </div>
    </section>
  );
}
