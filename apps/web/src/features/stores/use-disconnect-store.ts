import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { disconnectStoreFn } from "./stores.functions";

/** Disconnects a store, refreshes the store list and reports the outcome in a toast. */
export function useDisconnectStore(onDisconnected: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeConnectionId: string) => disconnectStoreFn({ data: { storeConnectionId } }),
    onSuccess: async () => {
      toast.success("Loja desconectada");
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
      onDisconnected();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
