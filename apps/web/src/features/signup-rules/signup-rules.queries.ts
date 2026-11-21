import { queryOptions } from "@tanstack/react-query";
import { getSignupRulesFn } from "./signup-rules.functions";

export const signupRulesQueryOptions = () =>
  queryOptions({
    queryKey: ["signup-rules"],
    queryFn: () => getSignupRulesFn(),
  });
