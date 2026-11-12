import type { FulfillmentStatus } from "@sellbridge/shared/schemas";

/** The supplier's steps a reseller may record for them, when the supplier did not mark it here. */
const RESELLER_STEP_NOTES: Partial<Record<FulfillmentStatus, string>> = {
  accepted: "Use só se o fornecedor já te confirmou que aceitou o pedido e não marcou aqui.",
  picking: "Use só se o fornecedor já te confirmou que começou a separar e não marcou aqui.",
  ready: "Use só se o fornecedor já te confirmou que o pedido está embalado e não marcou aqui.",
  shipped: "Use só se o fornecedor já te confirmou que despachou o pedido e não marcou aqui.",
};

/**
 * The sentence under the reseller's "Marcar como …" button on a supplier's parcel: the step is
 * the supplier's, so the reseller should only record what the supplier already confirmed.
 * Null for the reseller's own parcel and for the delivery, which the reseller confirms.
 */
export function resellerStepNote(
  next: FulfillmentStatus,
  catalogKind: "seller" | "supplier" | undefined,
): string | null {
  if (catalogKind === "seller") {
    return null;
  }
  return RESELLER_STEP_NOTES[next] ?? null;
}
