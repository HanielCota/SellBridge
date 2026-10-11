import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { deleteWebhookEndpointFn } from "./webhooks.functions";
import { WEBHOOK_ENDPOINTS_QUERY_KEY } from "./webhooks.queries";

/** Deletes an endpoint, refreshes the list and reports the outcome in a toast. */
export function useDeleteWebhookEndpoint(onDeleted: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (endpointId: string) => deleteWebhookEndpointFn({ data: { endpointId } }),
    onSuccess: async () => {
      toast.success("Webhook excluído");
      await queryClient.invalidateQueries({ queryKey: WEBHOOK_ENDPOINTS_QUERY_KEY });
      onDeleted();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
