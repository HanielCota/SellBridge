import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateDeveloperKeyInput } from "./developer-keys";
import { createDeveloperKeyFn } from "./developer-keys.functions";
import { DEVELOPER_KEYS_QUERY_KEY } from "./developer-keys.queries";

/** Creates a key and refreshes the list; the caller shows the returned secret. */
export function useCreateDeveloperKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeveloperKeyInput) => createDeveloperKeyFn({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DEVELOPER_KEYS_QUERY_KEY });
    },
  });
}
