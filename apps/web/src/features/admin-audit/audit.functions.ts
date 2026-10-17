import { listAuditEntries } from "@sellbridge/database/repositories";
import { auditSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";

/** `/admin/auditoria`: only roles with `audit.view` (admins) read the platform's trail. */
export const adminListAudit = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("audit.view")])
  .validator(auditSearchSchema)
  .handler(async ({ data }) => await listAuditEntries(database, data));
