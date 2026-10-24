import {
  findSupplierOfProfile,
  getAttachment,
  getConversationAttachment,
} from "@sellbridge/database/repositories";
import { AppError } from "@sellbridge/shared/errors";
import { database } from "@/lib/server/database";
import type { TenantSession } from "@/lib/server/tenant-session";

function isNotFound(error: unknown): boolean {
  return error instanceof AppError && error.code === "NOT_FOUND";
}

/**
 * A file the profile may download: one of its own tickets, or, for a supplier profile, one of
 * the conversations stores sent to its brand. Anything else answers "not found".
 */
export async function findProfileAttachment(session: TenantSession, attachmentId: string) {
  try {
    return await getAttachment(database, attachmentId, session.tenantId);
  } catch (error) {
    if (!isNotFound(error) || session.profileKind !== "supplier") {
      throw error;
    }
    const supplier = await findSupplierOfProfile(database, session.tenantId);
    if (supplier === null) {
      throw error;
    }
    return getConversationAttachment(database, { attachmentId, supplierId: supplier.id });
  }
}
