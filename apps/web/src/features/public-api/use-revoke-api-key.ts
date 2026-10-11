import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { revokeApiKeyFn } from "./api-keys.functions";
import { API_KEYS_QUERY_KEY } from "./api-keys.queries";

/** Revokes a key, refreshes the list and reports the outcome in a toast. */
export function useRevokeApiKey(onRevoked: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKeyId: string) => revokeApiKeyFn({ data: { apiKeyId } }),
    onSuccess: async () => {
      toast.success("Chave revogada");
      await queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
      onRevoked();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
