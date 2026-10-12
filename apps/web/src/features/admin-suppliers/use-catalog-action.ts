import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

export function useCatalogAction<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  message: string,
  onSuccess?: (result: TResult) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async (result) => {
      toast.success(message);
      if (
        typeof result === "object" &&
        result !== null &&
        "synchronizationQueued" in result &&
        result.synchronizationQueued === false
      ) {
        toast.warning("Catálogo salvo. A sincronização será retomada automaticamente pelo worker.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] }),
        queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
        queryClient.invalidateQueries({ queryKey: ["supplier-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["region-catalog"] }),
      ]);
      onSuccess?.(result);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
