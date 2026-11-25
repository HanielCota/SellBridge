import { queryOptions } from "@tanstack/react-query";
import { getDeveloperKeys } from "./developer-keys.functions";

export const DEVELOPER_KEYS_QUERY_KEY = ["developer-keys"] as const;

export const developerKeysQueryOptions = () =>
  queryOptions({
    queryKey: DEVELOPER_KEYS_QUERY_KEY,
    queryFn: () => getDeveloperKeys(),
  });
