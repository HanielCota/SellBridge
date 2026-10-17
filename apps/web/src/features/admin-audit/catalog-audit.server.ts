import { type CatalogEntity, recordCatalogEvent } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";

interface CatalogWrite {
  entityType: CatalogEntity;
  entityId: string;
  action: string;
  details?: Record<string, string | number | boolean | null>;
}

/**
 * Item 08.b/28.b: every write to the supplier catalog lands in the audit trail. Recorded after
 * the write went through; a failed record is logged (and alerted) but never undoes or fails a
 * write the admin already made.
 */
export async function recordCatalogWrite(adminId: string, write: CatalogWrite): Promise<void> {
  try {
    await recordCatalogEvent(database, { adminId, ...write });
  } catch (error) {
    logger.error("audit.catalog_record_failed", {
      action: write.action,
      entityType: write.entityType,
      entityId: write.entityId,
      error,
    });
  }
}

export function activeAction(entity: CatalogEntity, active: boolean): string {
  return `${entity}.${active ? "activated" : "deactivated"}`;
}

export function savedAction(entity: CatalogEntity, existingId: string | undefined): string {
  return `${entity}.${existingId === undefined ? "created" : "updated"}`;
}
