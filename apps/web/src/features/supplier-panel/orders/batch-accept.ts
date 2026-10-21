import { isAppError } from "@sellbridge/shared/errors";
import { FULFILLMENT_LABELS, type FulfillmentStatus } from "@sellbridge/shared/schemas";

/** One parcel of a batch: accepted, or why not, so a partial batch is never silent. */
export type BatchItemResult =
  { shipmentId: string; accepted: true } | { shipmentId: string; accepted: false; reason: string };

export interface BatchAcceptReport {
  results: BatchItemResult[];
  acceptedCount: number;
  failedCount: number;
}

const UNEXPECTED_FAILURE = "Não foi possível aceitar. Tente de novo.";

/**
 * Accepts each parcel on its own write, one after the other: each write locks its order, and a
 * refusal (already accepted, sale cancelled, another supplier's parcel) stops only that parcel.
 * `onUnexpected` hears errors that are not the app's own, so they are logged, never swallowed.
 */
export async function acceptEachShipment(
  shipmentIds: readonly string[],
  accept: (shipmentId: string) => Promise<unknown>,
  onUnexpected: (shipmentId: string, error: unknown) => void,
): Promise<BatchAcceptReport> {
  const results: BatchItemResult[] = [];
  for (const shipmentId of shipmentIds) {
    results.push(await acceptOne(shipmentId, accept, onUnexpected));
  }
  const acceptedCount = results.filter((result) => result.accepted).length;
  return { results, acceptedCount, failedCount: results.length - acceptedCount };
}

async function acceptOne(
  shipmentId: string,
  accept: (shipmentId: string) => Promise<unknown>,
  onUnexpected: (shipmentId: string, error: unknown) => void,
): Promise<BatchItemResult> {
  try {
    await accept(shipmentId);
    return { shipmentId, accepted: true };
  } catch (error) {
    if (isAppError(error)) {
      return { shipmentId, accepted: false, reason: error.userMessage };
    }
    onUnexpected(shipmentId, error);
    return { shipmentId, accepted: false, reason: UNEXPECTED_FAILURE };
  }
}

/** What the batch knows of a selected parcel before writing it. */
export interface OwnedShipment {
  id: string;
  status: FulfillmentStatus;
}

/**
 * Why a selected parcel will not be accepted, read before any write so the reason is plain:
 * not the supplier's (or gone), or already past "Aguardando fornecedor". Null: try the write.
 */
export function acceptRefusal(shipmentId: string, owned: readonly OwnedShipment[]) {
  const shipment = owned.find((candidate) => candidate.id === shipmentId);
  if (shipment === undefined) {
    return "Pedido fora da sua lista. Atualize a página.";
  }
  if (shipment.status !== "forwarded") {
    return `Já estava em "${FULFILLMENT_LABELS[shipment.status]}".`;
  }
  return null;
}
