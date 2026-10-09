import { ArrowClockwiseIcon, PauseIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useBulkListingActions } from "@/features/listings/use-listing-actions";

/** Appears while rows are selected; actions apply to every store of the selected listings. */
export function BulkActionsBar({
  listingIds,
  onClear,
}: {
  listingIds: string[];
  onClear: () => void;
}) {
  const { retry, pause, isPending } = useBulkListingActions(onClear);
  if (listingIds.length === 0) {
    return null;
  }
  const count = listingIds.length;
  return (
    <section
      aria-label="Ações em lote"
      className="sticky bottom-4 z-20 mx-auto flex w-fit flex-wrap items-center gap-2 rounded-full bg-foreground py-2 pr-2 pl-5 text-background shadow-2xl shadow-black/40"
    >
      <p className="mr-2 text-sm font-medium">
        {count} {count === 1 ? "selecionada" : "selecionadas"}
      </p>
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => pause.mutate({ listingIds, paused: true })}
      >
        <PauseIcon aria-hidden="true" />
        Pausar
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => pause.mutate({ listingIds, paused: false })}
      >
        <PlayIcon aria-hidden="true" />
        Reativar
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => retry.mutate(listingIds)}
      >
        <ArrowClockwiseIcon aria-hidden="true" />
        Reprocessar erros
      </Button>
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
