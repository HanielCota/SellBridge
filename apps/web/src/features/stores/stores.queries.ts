import { queryOptions } from "@tanstack/react-query";
import { listStores } from "./stores.functions";

export const storesQueryOptions = () =>
  queryOptions({
    queryKey: ["stores"],
    queryFn: () => listStores(),
  });
