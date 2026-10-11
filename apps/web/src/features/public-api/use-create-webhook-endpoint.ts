import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateWebhookEndpointInput } from "./webhooks";
import { createWebhookEndpointFn } from "./webhooks.functions";
import { WEBHOOK_ENDPOINTS_QUERY_KEY } from "./webhooks.queries";

/** Creates an endpoint and refreshes the list; the caller shows the returned secret. */
export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWebhookEndpointInput) => createWebhookEndpointFn({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WEBHOOK_ENDPOINTS_QUERY_KEY });
    },
  });
}
