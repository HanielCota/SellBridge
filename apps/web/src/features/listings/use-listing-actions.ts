import { useMutation, useQueryClient } from "@tanstack/react-query";
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

function useRefreshListings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["listings"] });
}

/** Retry, pause and resume for one or many listings, with the feedback toasts. */
export function useBulkListingActions(onDone?: () => void) {
  const refresh = useRefreshListings();

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
    onSuccess: async ({ changed }, { paused }) => {
      const stores = plural(changed, "loja", "lojas");
      toast.success(paused ? `Pausado em ${stores}` : `Reativado em ${stores}`);
      await refresh();
      onDone?.();
    },
    onError: showError,
  });

  return {
    retry,
    pause,
    isPending: retry.isPending || pause.isPending,
  };
}

export function useUpdatePrice(onSaved: () => void) {
  const refresh = useRefreshListings();
  return useMutation({
    mutationFn: (input: { listingId: string; priceCents: number }) =>
      updateListingPriceFn({ data: input }),
    onSuccess: async () => {
      toast.success("Preço atualizado. As lojas recebem o novo valor em instantes.");
      await refresh();
      onSaved();
    },
    onError: showError,
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
