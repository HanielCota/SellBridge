import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import {
  retryListings,
  setListingsPausedFn,
  simulateMockSale,
  updateListingPriceFn,
} from "./listings.functions";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function showError(error: unknown) {
  toast.error(errorMessage(error));
}

type ListingsPage = { items: ListingOverviewRow[] };
type Snapshot = [readonly unknown[], ListingsPage | undefined][];

/**
 * Applies a change to every cached listings page right away and returns how to undo it,
 * so pause and price edits show instantly and roll back if the server refuses.
 */
async function patchListings(
  queryClient: QueryClient,
  listingIds: readonly string[],
  patch: (row: ListingOverviewRow) => ListingOverviewRow,
): Promise<Snapshot> {
  await queryClient.cancelQueries({ queryKey: ["listings"] });
  const snapshot = queryClient.getQueriesData<ListingsPage>({ queryKey: ["listings"] });
  const ids = new Set(listingIds);
  // Other caches share the "listings" prefix (e.g. the nav counters); only pages have items.
  queryClient.setQueriesData<ListingsPage>({ queryKey: ["listings"] }, (page) =>
    page && Array.isArray(page.items)
      ? { ...page, items: page.items.map((row) => (ids.has(row.listingId) ? patch(row) : row)) }
      : page,
  );
  return snapshot;
}

function restore(queryClient: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) {
    queryClient.setQueryData(key, data);
  }
}

function withPaused(row: ListingOverviewRow, paused: boolean): ListingOverviewRow {
  const from = paused ? "published" : "paused";
  const to = paused ? "paused" : "published";
  return {
    ...row,
    stores: row.stores.map((store) => (store.status === from ? { ...store, status: to } : store)),
  };
}

function useRefreshListings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["listings"] });
}

/** Retry, pause and resume for one or many listings, with the feedback toasts. */
export function useBulkListingActions(onDone?: () => void) {
  const refresh = useRefreshListings();
  const queryClient = useQueryClient();

  const retry = useMutation({
    mutationFn: (listingIds: string[]) => retryListings({ data: { listingIds } }),
    onSuccess: async ({ retried }) => {
      toast.success(
        retried > 0 ? "Publicação reenviada para a fila" : "Nenhuma publicação com erro",
      );
      await refresh();
      onDone?.();
    },
    onError: showError,
  });

  const pause = useMutation({
    mutationFn: (input: { listingIds: string[]; paused: boolean }) =>
      setListingsPausedFn({ data: input }),
    onMutate: (input) =>
      patchListings(queryClient, input.listingIds, (row) => withPaused(row, input.paused)),
    onError: (error, _input, snapshot) => {
      restore(queryClient, snapshot);
      showError(error);
    },
    onSuccess: async ({ changed }, { paused }) => {
      const stores = plural(changed, "loja", "lojas");
      toast.success(paused ? `Pausado em ${stores}` : `Reativado em ${stores}`);
      await refresh();
      onDone?.();
    },
  });

  return {
    retry,
    pause,
    isPending: retry.isPending || pause.isPending,
  };
}

export function useUpdatePrice(onSaved: () => void) {
  const refresh = useRefreshListings();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { listingId: string; priceCents: number }) =>
      updateListingPriceFn({ data: input }),
    onMutate: (input) =>
      patchListings(queryClient, [input.listingId], (row) => ({
        ...row,
        priceCents: input.priceCents,
      })),
    onError: (error, _input, snapshot) => {
      restore(queryClient, snapshot);
      showError(error);
    },
    onSuccess: async () => {
      toast.success("Preço atualizado. As lojas recebem o novo valor em instantes.");
      await refresh();
      onSaved();
    },
  });
}

export function useSimulateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listingTargetId: string) => simulateMockSale({ data: { listingTargetId } }),
    onSuccess: async () => {
      toast.success("Venda simulada enviada. Ela aparece no financeiro em instantes.");
      await queryClient.invalidateQueries({ queryKey: ["financials"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: showError,
  });
}
