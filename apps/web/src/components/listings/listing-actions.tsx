import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import {
  ArrowClockwiseIcon,
  DotsThreeVerticalIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  ShoppingCartSimpleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBulkListingActions, useSimulateSale } from "@/features/listings/use-listing-actions";
import { EditPriceDialog } from "./edit-price-dialog";

function hasStatus(
  row: ListingOverviewRow,
  status: ListingOverviewRow["stores"][number]["status"],
) {
  return row.stores.some((store) => store.status === status);
}

function PauseMenuItem({ row }: { row: ListingOverviewRow }) {
  const { pause } = useBulkListingActions();
  if (hasStatus(row, "paused")) {
    return (
      <DropdownMenuItem
        onSelect={() => pause.mutate({ listingIds: [row.listingId], paused: false })}
      >
        <PlayIcon aria-hidden="true" />
        Reativar
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem
      disabled={!hasStatus(row, "published")}
      onSelect={() => pause.mutate({ listingIds: [row.listingId], paused: true })}
    >
      <PauseIcon aria-hidden="true" />
      Pausar
    </DropdownMenuItem>
  );
}

function SimulateSaleItem({ row }: { row: ListingOverviewRow }) {
  const simulate = useSimulateSale();
  const target = row.stores.find(
    (store) => store.marketplace === "mock" && store.status === "published",
  );
  if (!target) {
    return null;
  }
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => simulate.mutate(target.id)}>
        <ShoppingCartSimpleIcon aria-hidden="true" />
        Simular venda
      </DropdownMenuItem>
    </>
  );
}

function RetryButton({ listingId }: { listingId: string }) {
  const { retry } = useBulkListingActions();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={retry.isPending}
      onClick={() => retry.mutate([listingId])}
    >
      <ArrowClockwiseIcon
        aria-hidden="true"
        className={retry.isPending ? "animate-spin" : undefined}
      />
      Reprocessar
    </Button>
  );
}

/** Retry stays in sight when something failed; the rest lives in the row menu. */
export function ListingActions({ row }: { row: ListingOverviewRow }) {
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  return (
    <div className="flex items-center justify-end gap-1">
      {hasStatus(row, "error") ? <RetryButton listingId={row.listingId} /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Ações de ${row.title}`}>
            <DotsThreeVerticalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setIsEditingPrice(true)}>
            <PencilSimpleIcon aria-hidden="true" />
            Editar preço
          </DropdownMenuItem>
          <PauseMenuItem row={row} />
          <SimulateSaleItem row={row} />
        </DropdownMenuContent>
      </DropdownMenu>
      <EditPriceDialog open={isEditingPrice} onOpenChange={setIsEditingPrice} listing={row} />
    </div>
  );
}
