import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { setWebhookEndpointEnabledFn } from "./webhooks.functions";
import { WEBHOOK_ENDPOINTS_QUERY_KEY } from "./webhooks.queries";

/** Turns an endpoint on or off, refreshes the list and reports the outcome in a toast. */
export function useSetWebhookEndpointEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { endpointId: string; enabled: boolean }) =>
      setWebhookEndpointEnabledFn({ data: input }),
    onSuccess: async (_endpoint, input) => {
      toast.success(input.enabled ? "Webhook ativado" : "Webhook desativado");
      await queryClient.invalidateQueries({ queryKey: WEBHOOK_ENDPOINTS_QUERY_KEY });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
