import { queryOptions } from "@tanstack/react-query";
import { getTeamNoticesFn } from "./team-notices.functions";

export const teamNoticesQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-panel", supplierId, "team-notices"],
    queryFn: () => getTeamNoticesFn({ data: { supplierId } }),
  });
