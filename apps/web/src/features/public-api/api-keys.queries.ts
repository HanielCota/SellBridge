import { queryOptions } from "@tanstack/react-query";
import { getApiKeys } from "./api-keys.functions";

export const API_KEYS_QUERY_KEY = ["api-keys"] as const;

export const apiKeysQueryOptions = () =>
  queryOptions({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: () => getApiKeys(),
  });
