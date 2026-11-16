export type ButtonEmphasis = "default" | "outline";

/**
 * Recebimentos shows one filled button at a time: linking Mercado Pago comes first, unless the
 * new-supplier rule requires Asaas, or Mercado Pago is already linked and Asaas is the next step.
 */
export function receivingEmphasis(input: {
  mercadoPagoAsksToLink: boolean;
  protectionRequired: boolean;
}): { mercadoPago: ButtonEmphasis; asaas: ButtonEmphasis } {
  if (input.protectionRequired) {
    return { mercadoPago: "outline", asaas: "default" };
  }
  if (input.mercadoPagoAsksToLink) {
    return { mercadoPago: "default", asaas: "outline" };
  }
  return { mercadoPago: "default", asaas: "default" };
}
