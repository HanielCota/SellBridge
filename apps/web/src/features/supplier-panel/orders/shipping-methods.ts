/** How the parcel leaves the supplier, in a word for the list and a sentence for the order. */
export interface ShippingMethod {
  readonly short: string;
  readonly long: string;
}

/**
 * Mercado Livre's `logistic_type` values, in the supplier's words: whether to wait for the
 * pickup or take the parcel out. Values Mercado Livre may add later show nothing.
 */
const SHIPPING_METHODS: Readonly<Record<string, ShippingMethod>> = {
  cross_docking: { short: "Coleta", long: "Coleta: o Mercado Livre busca" },
  // Both drop-offs read the same: which counter takes the parcel is printed on the label.
  xd_drop_off: { short: "Agência", long: "Agência: você leva ao ponto indicado na etiqueta" },
  drop_off: { short: "Agência", long: "Agência: você leva ao ponto indicado na etiqueta" },
  self_service: { short: "Flex", long: "Flex: você mesmo entrega" },
  // Full ships from Mercado Livre's own warehouse: the supplier has nothing to send.
  fulfillment: {
    short: "Full: não despachar",
    long: "Full: o Mercado Livre envia do estoque dele",
  },
};

/**
 * The shipping method of a parcel, or null when the marketplace has not said it yet or said
 * something the supplier would not understand.
 *
 * @param logisticType - Mercado Livre's `logistic_type`, as stored on the parcel.
 * @returns The short and the long name, or null.
 */
export function shippingMethod(logisticType: string | null): ShippingMethod | null {
  if (logisticType === null) {
    return null;
  }
  return Object.hasOwn(SHIPPING_METHODS, logisticType)
    ? (SHIPPING_METHODS[logisticType] ?? null)
    : null;
}
