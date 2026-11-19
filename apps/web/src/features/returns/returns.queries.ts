import { queryOptions } from "@tanstack/react-query";
import { getOrderReturnsFn, getReturnAnswerDaysFn } from "./returns.functions";

export const orderReturnsQueryOptions = (orderId: string) =>
  queryOptions({
    queryKey: ["order-returns", orderId],
    queryFn: () => getOrderReturnsFn({ data: { orderId } }),
  });

export const returnAnswerDaysQueryOptions = () =>
  queryOptions({ queryKey: ["return-answer-days"], queryFn: () => getReturnAnswerDaysFn() });
