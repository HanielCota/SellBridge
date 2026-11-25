import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { revokeDeveloperKeyFn } from "./developer-keys.functions";
import { DEVELOPER_KEYS_QUERY_KEY } from "./developer-keys.queries";

/** Revokes a key, refreshes the list and reports the outcome in a toast. */
export function useRevokeDeveloperKey(onRevoked: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (developerApiKeyId: string) =>
      revokeDeveloperKeyFn({ data: { developerApiKeyId } }),
    onSuccess: async () => {
      toast.success("Chave revogada. Os projetos que a usavam já não conseguem ler os dados.");
      await queryClient.invalidateQueries({ queryKey: DEVELOPER_KEYS_QUERY_KEY });
      onRevoked();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
