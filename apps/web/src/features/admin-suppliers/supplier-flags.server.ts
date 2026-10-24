import {
  type AppliedSupplierFlag,
  applySupplierFlag,
  getFlaggableSupplier,
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
import { requestStockSync } from "@/lib/server/stock-sync";
import { noticeSupplierFlag } from "./supplier-flag-notice.server";

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

/**
 * The supplier's name, whether it is active (the apply dialog warns about the 3rd strike) and its
 * flags; nothing else of its record (the flags page is for all staff).
 */
export async function loadTeamSupplierFlags(actor: StaffActor, supplierId: string) {
  const [supplier, result] = await Promise.all([
    getFlaggableSupplier(database, supplierId),
    listTeamSupplierFlags(database, supplierId, new Date()),
  ]);
  return {
    supplierName: supplier.name,
    supplierActive: supplier.active,
    ...result,
    canManage: hasStaffPermission(actor.role, "suppliers.flag"),
  };
}

/**
 * The 3rd strike went through the supplier deactivation the admin record uses: recorded the same
 * way, plus the cause, and the paused listings' zero stock is pushed right away.
 */
async function recordThirdStrike(actor: StaffActor, supplierId: string, flag: AppliedSupplierFlag) {
  logger.warn("supplier_flags.supplier_deactivated", {
    supplierId,
    flagId: flag.id,
    pausedTargets: flag.pausedTargets,
    role: actor.role,
  });
  await recordCatalogWrite(actor.userId, {
    entityType: "supplier",
    entityId: supplierId,
    action: "supplier.deactivated",
    details: { pausedTargets: flag.pausedTargets, cause: "third_flag", flagId: flag.id },
  });
  await requestStockSync("supplier_flags.deactivation_sync_deferred");
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
  if (flag.supplierDeactivated) {
    await recordThirdStrike(actor, input.supplierId, flag);
  }
  await noticeSupplierFlag({
    supplierId: input.supplierId,
    reason: input.reason,
    activeCount: flag.activeCount,
    deactivated: flag.supplierDeactivated,
    supplierActive: flag.supplierActive,
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
