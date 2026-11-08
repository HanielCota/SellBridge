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
  xd_drop_off: { short: "Agência", long: "Agência: você leva a uma agência do Mercado Livre" },
  drop_off: { short: "Agência", long: "Agência: você leva aos Correios" },
  self_service: { short: "Flex", long: "Flex: você mesmo entrega" },
  fulfillment: { short: "Full", long: "Full: sai do estoque do Mercado Livre" },
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
