import { queryOptions } from "@tanstack/react-query";
import { getWebhookEndpoints } from "./webhooks.functions";

export const WEBHOOK_ENDPOINTS_QUERY_KEY = ["webhook-endpoints"] as const;

/** Refreshed every half minute so delivery attempts show up while the page is open. */
export const webhookEndpointsQueryOptions = () =>
  queryOptions({
    queryKey: WEBHOOK_ENDPOINTS_QUERY_KEY,
    queryFn: () => getWebhookEndpoints(),
    refetchInterval: 30_000,
  });
