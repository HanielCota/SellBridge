import { findSoleOwnedTenants } from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import type { DeletionBlockerLine } from "@/features/profile/deletion-blockers";
import { listDeletionBlockers } from "@/lib/server/account-deletion-blockers.server";
import { database } from "@/lib/server/database";
import { signedInMiddleware } from "@/lib/server/middleware";

/**
 * What is left to resolve before the account can be deleted, for the Seus dados screen. The
 * deletion itself checks again on the server (`assertNothingLeftToResolve`).
 */
export const getDeletionBlockersFn = createServerFn({ method: "GET" })
  .middleware([signedInMiddleware])
  .handler(async ({ context }): Promise<DeletionBlockerLine[]> => {
    const tenantIds = await findSoleOwnedTenants(database, context.userId);
    return await listDeletionBlockers({ userId: context.userId, tenantIds, now: new Date() });
  });
