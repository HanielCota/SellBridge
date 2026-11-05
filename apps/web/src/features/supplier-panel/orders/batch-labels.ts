import { LABEL_MARKETPLACE, LABEL_STATUSES } from "@sellbridge/shared/supplier-order-labels";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";

/** One parcel of a label batch: printed, or why not, so a partial batch is never silent. */
export type LabelItemResult =
  { shipmentId: string; printed: true } | { shipmentId: string; printed: false; reason: string };

/** One PDF of the batch: the labels of one reseller store, as Mercado Livre prints them. */
export interface LabelFile {
  storeName: string;
  labelCount: number;
  pdfBase64: string;
}

export interface BatchLabelsReport {
  files: LabelFile[];
  results: LabelItemResult[];
  printedCount: number;
  failedCount: number;
}

/** What the batch knows of a selected parcel before asking the marketplace. */
export interface LabelCandidate {
  id: string;
  orderId: string;
  tenantId: string;
  status: FulfillmentStatus;
  orderStatus: string;
  storeId: string;
  shopName: string;
  marketplace: string;
}

/**
 * Why a selected parcel's label will not be asked for, read before any marketplace call so the
 * reason is plain. Null: ask the marketplace.
 */
export function labelRefusal(candidate: LabelCandidate | undefined): string | null {
  if (candidate === undefined) {
    return "Pedido fora da sua lista. Atualize a página.";
  }
  if (candidate.marketplace !== LABEL_MARKETPLACE) {
    return "Este canal não tem etiqueta do marketplace: use a sua própria.";
  }
  if (isShippingBlocked(candidate.orderStatus)) {
    return "Venda sem liberação para envio.";
  }
  const statuses: readonly FulfillmentStatus[] = LABEL_STATUSES;
  if (!statuses.includes(candidate.status)) {
    return "Este pedido já saiu: a etiqueta não é mais emitida.";
  }
  return null;
}

/** The selected parcels split into refusals and, per reseller store, the ones to print. */
export function planLabelBatch(
  shipmentIds: readonly string[],
  candidates: readonly LabelCandidate[],
) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const refused: LabelItemResult[] = [];
  const printable: LabelCandidate[] = [];
  for (const shipmentId of shipmentIds) {
    const candidate = byId.get(shipmentId);
    const reason = labelRefusal(candidate);
    if (reason !== null || candidate === undefined) {
      refused.push({ shipmentId, printed: false, reason: reason ?? "Pedido não encontrado." });
      continue;
    }
    printable.push(candidate);
  }
  const stores = new Map<string, LabelCandidate[]>();
  for (const candidate of printable) {
    const group = stores.get(candidate.storeId);
    if (group === undefined) {
      stores.set(candidate.storeId, [candidate]);
      continue;
    }
    group.push(candidate);
  }
  return { refused, stores: [...stores.values()] };
}
