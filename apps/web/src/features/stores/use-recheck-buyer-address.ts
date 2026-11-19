import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { recheckOutcomeCopy } from "./buyer-address-copy";
import { recheckBuyerAddressFn } from "./stores.functions";

/** "Já arrumei, conferir de novo": reads the account again and says what it found. */
export function useRecheckBuyerAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeConnectionId: string) =>
      recheckBuyerAddressFn({ data: { storeConnectionId } }),
    onSuccess: async ({ result }) => {
      const copy = recheckOutcomeCopy(result);
      toast[copy.kind](copy.title, { description: copy.description });
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
