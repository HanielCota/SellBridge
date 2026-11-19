import { queryOptions } from "@tanstack/react-query";
import { getReceivingRulesFn } from "./receiving-rules.functions";

export const receivingRulesQueryOptions = () =>
  queryOptions({ queryKey: ["receiving-rules"], queryFn: () => getReceivingRulesFn() });
