import { queryOptions } from "@tanstack/react-query";
import { getNotifications } from "./notifications.functions";

const ONE_MINUTE = 60_000;

export const notificationsQueryOptions = () =>
  queryOptions({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    refetchInterval: ONE_MINUTE,
  });
