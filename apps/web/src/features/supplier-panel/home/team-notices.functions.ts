import { supplierFlagsInputSchema } from "@sellbridge/shared/supplier-flags";
import { createServerFn } from "@tanstack/react-start";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { loadTeamNotices } from "./team-notices.server";

/** Read only: a supplier may see its own flags, never another's, and has nothing to change. */
export const getTeamNoticesFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierFlagsInputSchema)
  .handler(async ({ data }) => await loadTeamNotices(data.supplierId));
