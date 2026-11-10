import { z } from "zod";
import type { StoreCredentials } from "../types.ts";
import { marketplaceError } from "../errors.ts";
import { requestJson, type MercadoLivreConfig } from "./client.ts";
import { externalIdSchema } from "./schemas.ts";

/**
 * The buyer's fiscal data for the NF-e, read as the "Dados para emissão de Nota Fiscal" guide
 * says (developers.mercadolivre.com.br/pt_br/faturamento): the order gives the billing info id,
 * `/orders/billing-info/MLB/{id}` gives the document. Never logged or stored: it goes straight to
 * the supplier's ERP.
 */

const orderBillingSchema = z.object({
  seller: z.object({ id: externalIdSchema }),
  buyer: z
    .object({
      billing_info: z.object({ id: externalIdSchema }).nullish(),
    })
    .nullish(),
});

const billingInfoSchema = z.object({
  buyer: z.object({
    billing_info: z.object({
      name: z.string().nullish(),
      last_name: z.string().nullish(),
      identification: z
        .object({ type: z.string().nullish(), number: z.string().nullish() })
        .nullish(),
      taxes: z
        .object({
          inscriptions: z.object({ state_registration: z.string().nullish() }).nullish(),
        })
        .nullish(),
    }),
  }),
});

export interface BuyerBilling {
  readonly documentType: "CPF" | "CNPJ";
  /** Digits only. */
  readonly document: string;
  /** The name on the billing data; null when the marketplace sent none. */
  readonly name: string | null;
  /** A company's state registration (digits); null for a person or a company without one. */
  readonly stateRegistration: string | null;
}

const DOCUMENT_LENGTHS = { CPF: 11, CNPJ: 14 } as const;

function fullName(first: string | null | undefined, last: string | null | undefined) {
  const name = [first, last]
    .filter((part): part is string => part !== null && part !== undefined)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" ");
  return name === "" ? null : name;
}

/** "ISENTO", blank or no digits all mean the company is not an ICMS taxpayer. */
function stateRegistration(
  billing: z.infer<typeof billingInfoSchema>["buyer"]["billing_info"],
): string | null {
  const digits = (billing.taxes?.inscriptions?.state_registration ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
}

/** The CPF or CNPJ with the right number of digits, or null for anything else. */
export function toBuyerBilling(
  billing: z.infer<typeof billingInfoSchema>["buyer"]["billing_info"],
): BuyerBilling | null {
  const type = billing.identification?.type?.trim().toUpperCase();
  const digits = (billing.identification?.number ?? "").replace(/\D/g, "");
  if (type !== "CPF" && type !== "CNPJ") {
    return null;
  }
  if (digits.length !== DOCUMENT_LENGTHS[type]) {
    return null;
  }
  return {
    documentType: type,
    document: digits,
    name: fullName(billing.name, billing.last_name),
    stateRegistration: type === "CNPJ" ? stateRegistration(billing) : null,
  };
}

/**
 * The CPF or CNPJ the buyer gave at checkout, or null when the order has none (or one that is not
 * a Brazilian document).
 */
export async function readMercadoLivreBuyerBilling(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
): Promise<BuyerBilling | null> {
  if (!/^\d+$/.test(orderId)) {
    throw marketplaceError("Número de pedido inválido", { retryable: false });
  }
  const context = {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
  const order = await requestJson(context, {
    schema: orderBillingSchema,
    path: `/orders/${orderId}`,
    init: { accessToken: store.accessToken },
  });
  if (String(order.seller.id) !== store.externalShopId) {
    throw marketplaceError("Pedido não pertence à loja conectada", { retryable: false });
  }
  const billingId = order.buyer?.billing_info?.id;
  if (billingId === undefined) {
    return null;
  }
  const info = await requestJson(context, {
    schema: billingInfoSchema,
    path: `/orders/billing-info/MLB/${encodeURIComponent(String(billingId))}`,
    init: { accessToken: store.accessToken },
  });
  return toBuyerBilling(info.buyer.billing_info);
}
