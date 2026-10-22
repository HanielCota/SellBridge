import {
  applySupplierFlag,
  listTeamSupplierFlags,
  revokeSupplierFlag,
} from "@sellbridge/database/repositories";
import { forbiddenError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { hasStaffPermission, type StaffRole } from "@sellbridge/shared/staff-access";
import type {
  ApplySupplierFlagInput,
  RevokeSupplierFlagInput,
} from "@sellbridge/shared/supplier-flags";
import { recordCatalogWrite } from "@/features/admin-audit/catalog-audit.server";
import { database } from "@/lib/server/database";

/** Who is acting, as `staffMiddleware` hands it over. */
interface StaffActor {
  userId: string;
  role: StaffRole;
}

/**
 * The middleware already requires `suppliers.flag`; checked again here so a function wired to
 * the wrong middleware still cannot apply or revoke (MVP function 6: agents only read).
 */
function assertMayFlag(actor: StaffActor): void {
  if (!hasStaffPermission(actor.role, "suppliers.flag")) {
    throw forbiddenError("Só administradores e supervisores aplicam ou retiram flags.");
  }
}

export async function loadTeamSupplierFlags(actor: StaffActor, supplierId: string) {
  const result = await listTeamSupplierFlags(database, supplierId, new Date());
  return { ...result, canManage: hasStaffPermission(actor.role, "suppliers.flag") };
}

export async function applyFlag(actor: StaffActor, input: ApplySupplierFlagInput) {
  assertMayFlag(actor);
  const flag = await applySupplierFlag(database, { ...input, createdBy: actor.userId });
  logger.info("supplier_flags.applied", {
    supplierId: input.supplierId,
    flagId: flag.id,
    reason: input.reason,
    role: actor.role,
  });
  await recordCatalogWrite(actor.userId, {
    entityType: "supplier",
    entityId: input.supplierId,
    action: "supplier.flag_applied",
    details: { flagId: flag.id, reason: input.reason },
  });
  return flag;
}

export async function revokeFlag(actor: StaffActor, input: RevokeSupplierFlagInput) {
  assertMayFlag(actor);
  const revoked = await revokeSupplierFlag(database, {
    ...input,
    revokedBy: actor.userId,
    now: new Date(),
  });
  logger.info("supplier_flags.revoked", {
    supplierId: input.supplierId,
    flagId: revoked.id,
    role: actor.role,
  });
  await recordCatalogWrite(actor.userId, {
    entityType: "supplier",
    entityId: input.supplierId,
    action: "supplier.flag_revoked",
    details: { flagId: revoked.id },
  });
  return revoked;
}
