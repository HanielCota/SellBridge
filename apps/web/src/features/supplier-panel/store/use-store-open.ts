import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { setStoreOpenFn } from "./store-open.functions";

/**
 * Opens or closes the supplier's store, then reloads the panel layout (which reads the store
 * state for the switch and the banner) and the panel's own data.
 */
export function useStoreOpen(supplierId: string, onDone?: () => void) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (open: boolean) => await setStoreOpenFn({ data: { supplierId, open } }),
    onSuccess: async (result) => {
      onDone?.();
      toast.success(
        result.salesClosedAt === null
          ? "Loja aberta. O estoque volta aos anúncios dos revendedores em instantes."
          : "Loja fechada. Os anúncios dos revendedores ficam sem estoque até você reabrir.",
      );
      await Promise.all([
        router.invalidate(),
        queryClient.invalidateQueries({ queryKey: ["supplier-panel", supplierId] }),
      ]);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
