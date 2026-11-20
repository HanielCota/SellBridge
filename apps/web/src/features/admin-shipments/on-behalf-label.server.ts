import {
  findOnBehalfLabelParcels,
  findOnBehalfLabelState,
  releaseOnBehalfLabel,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { onBehalfLabelRefusal } from "@sellbridge/shared/reseller-invoice";
import { hasStaffPermission, type StaffRole } from "@sellbridge/shared/staff-access";
import { database } from "@/lib/server/database";

/** A venda à ordem parcel's label as Admin › Envios shows it. */
export interface StaffOnBehalfLabel {
  /** Why the label still waits, in the reseller's words; null once it can come out. */
  readonly waiting: string | null;
  readonly release: {
    readonly at: Date;
    readonly byName: string | null;
    readonly reason: string;
  } | null;
  /** Whether this member of the team may release it. */
  readonly canRelease: boolean;
}

/** The parcel's label state, or null when the parcel is not sold in venda à ordem. */
export async function loadStaffOnBehalfLabel(
  shipmentId: string,
  role: StaffRole,
): Promise<StaffOnBehalfLabel | null> {
  const state = await findOnBehalfLabelState(database, shipmentId);
  if (state === null) {
    return null;
  }
  const parcels = await findOnBehalfLabelParcels(database, {
    tenantId: state.tenantId,
    orderId: state.orderId,
  });
  return {
    waiting: onBehalfLabelRefusal(parcels, state.marketplace),
    release: state.release,
    canRelease: hasStaffPermission(role, "shipments.release_label"),
  };
}

/**
 * Lets the parcel's label out although a note is stuck (decision of 20/11/2026), keeping who did
 * it and why.
 *
 * @throws {AppError} NOT_FOUND when the parcel is not sold in venda à ordem; CONFLICT when its
 * label was already released.
 */
export async function releaseStaffOnBehalfLabel(input: {
  shipmentId: string;
  userId: string;
  role: StaffRole;
  reason: string;
}): Promise<StaffOnBehalfLabel | null> {
  await releaseOnBehalfLabel(database, {
    shipmentId: input.shipmentId,
    userId: input.userId,
    reason: input.reason,
    now: new Date(),
  });
  logger.info("label.released_by_staff", { shipmentId: input.shipmentId, userId: input.userId });
  return loadStaffOnBehalfLabel(input.shipmentId, input.role);
}
