import type { AuditSearchParams } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { adminListAudit } from "./audit.functions";

export const auditQueryOptions = (search: AuditSearchParams) =>
  queryOptions({
    queryKey: ["admin", "audit", search],
    queryFn: () => adminListAudit({ data: search }),
    placeholderData: keepPreviousData,
  });
