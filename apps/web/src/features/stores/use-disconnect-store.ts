import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { disconnectStoreFn } from "./stores.functions";

export interface DisconnectRequest {
  storeConnectionId: string;
  pauseListings: boolean;
}

function stillLive(count: number): string {
  return count === 1 ? "1 anúncio continua ativo" : `${count} anúncios continuam ativos`;
}

function pausedNow(count: number): string {
  return count === 1 ? "1 anúncio pausado" : `${count} anúncios pausados`;
}

/** The toast after disconnecting: what was paused, and what the seller still has to pause. */
function reportOutcome(outcome: { paused: number; leftLive: number }): void {
  if (outcome.leftLive > 0) {
    toast.warning("Loja desconectada", {
      description: `${stillLive(outcome.leftLive)} no marketplace. Pause direto por lá para não vender sem estoque.`,
    });
    return;
  }
  if (outcome.paused > 0) {
    toast.success("Loja desconectada", {
      description: `${pausedNow(outcome.paused)} no marketplace (estoque zero).`,
    });
    return;
  }
  toast.success("Loja desconectada");
}

/** Disconnects a store, refreshes the store list and reports the outcome in a toast. */
export function useDisconnectStore(onDisconnected: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DisconnectRequest) => disconnectStoreFn({ data: request }),
    onSuccess: async (outcome) => {
      reportOutcome(outcome);
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
      onDisconnected();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
