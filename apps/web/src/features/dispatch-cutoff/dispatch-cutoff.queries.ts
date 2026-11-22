import { queryOptions } from "@tanstack/react-query";
import { getDispatchCutoffFn } from "./dispatch-cutoff.functions";

export const dispatchCutoffQueryOptions = () =>
  queryOptions({ queryKey: ["dispatch-cutoff"], queryFn: () => getDispatchCutoffFn() });
