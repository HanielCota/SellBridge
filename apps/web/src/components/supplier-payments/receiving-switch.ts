import type { PaymentProviderName } from "@sellbridge/shared/payment-accounts";

/** What the supplier sees about each account on the "next payments" card. */
export const RECEIVING_PROVIDER_COPY: Readonly<
  Record<
    PaymentProviderName,
    { name: string; mark: string; detail: string; switchConsequence: string }
  >
> = {
  mercado_pago: {
    name: "Mercado Pago",
    mark: "MP",
    detail: "O dinheiro cai na hora em que o revendedor paga.",
    switchConsequence:
      "Os próximos pagamentos caem na hora na sua conta Mercado Pago, sem a proteção até a entrega. O que já foi pago pelo Asaas continua guardado até a entrega.",
  },
  asaas: {
    name: "Asaas",
    mark: "AS",
    detail: "O dinheiro fica guardado e é liberado 7 dias depois da entrega.",
    switchConsequence:
      "Os próximos pagamentos ficam guardados no Asaas e são liberados para você 7 dias depois da entrega. O que já foi pago pelo Mercado Pago continua lá.",
  },
};

/**
 * The account the supplier can switch the next payments to, or null when the other one cannot
 * receive (not linked, or Mercado Pago while the new-supplier rule requires protection).
 */
export function switchTarget(input: {
  current: PaymentProviderName;
  mercadoPagoUsable: boolean;
  asaasUsable: boolean;
  protectionRequired: boolean;
}): PaymentProviderName | null {
  if (input.current === "asaas") {
    const mercadoPagoAllowed = input.mercadoPagoUsable && !input.protectionRequired;
    return mercadoPagoAllowed ? "mercado_pago" : null;
  }
  return input.asaasUsable ? "asaas" : null;
}
