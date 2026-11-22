import {
  findOnBehalfLabelParcels,
  findOnBehalfLabelState,
  releaseOnBehalfLabel,
} from "@sellbridge/database/repositories";
import { conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  onBehalfLabelRefusal,
  type OnBehalfLabelParcel,
} from "@sellbridge/shared/reseller-invoice";
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
  /** Whether the parcel's own notes hold the label: only then is there something to release. */
  readonly ownHeld: boolean;
}

const NOTHING_TO_RELEASE =
  "As notas desta parcela já estão prontas: não há o que liberar. Se a etiqueta ainda espera, é por outro pedido do carrinho.";

/** Whether the parcel's own notes hold the label (not only another order of its cart). */
function isOwnLabelHeld(
  parcels: readonly OnBehalfLabelParcel[],
  shipmentId: string,
  marketplace: string,
): boolean {
  const own = parcels.filter((parcel) => parcel.shipmentId === shipmentId);
  return onBehalfLabelRefusal(own, marketplace) !== null;
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
    waiting: onBehalfLabelRefusal(parcels, state.marketplace, state.orderId),
    release: state.release,
    canRelease: hasStaffPermission(role, "shipments.release_label"),
    ownHeld: isOwnLabelHeld(parcels, shipmentId, state.marketplace),
  };
}

/**
 * Lets the parcel's label out although a note is stuck (decision of 20/11/2026), keeping who did
 * it and why.
 *
 * @throws {AppError} NOT_FOUND when the parcel is not sold in venda à ordem; CONFLICT when its own
 * notes do not hold the label or it was already released.
 */
export async function releaseStaffOnBehalfLabel(input: {
  shipmentId: string;
  userId: string;
  role: StaffRole;
  reason: string;
}): Promise<StaffOnBehalfLabel | null> {
  const current = await loadStaffOnBehalfLabel(input.shipmentId, input.role);
  if (current !== null && !current.ownHeld) {
    throw conflictError(NOTHING_TO_RELEASE);
  }
  await releaseOnBehalfLabel(database, {
    shipmentId: input.shipmentId,
    userId: input.userId,
    reason: input.reason,
    now: new Date(),
  });
  logger.info("label.released_by_staff", { shipmentId: input.shipmentId, userId: input.userId });
  return loadStaffOnBehalfLabel(input.shipmentId, input.role);
}
