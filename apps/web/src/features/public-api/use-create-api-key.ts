import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateApiKeyInput } from "./api-keys";
import { createApiKeyFn } from "./api-keys.functions";
import { API_KEYS_QUERY_KEY } from "./api-keys.queries";

/** Creates a key and refreshes the list; the caller shows the returned secret. */
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => createApiKeyFn({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
}
