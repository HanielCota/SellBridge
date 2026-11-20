import { isAppError } from "@sellbridge/shared/errors";
import type { MarketplaceSaleInvoice } from "@sellbridge/shared/reseller-invoice";
import { z } from "zod";
import { marketplaceError } from "../errors.ts";
import type { StoreCredentials } from "../types.ts";
import { requestJson, type MercadoLivreConfig } from "./client.ts";
import { externalIdSchema } from "./schemas.ts";

/**
 * The NF-e the seller attached to a sale, as "Importar Nota Fiscal › Consultar a Nota Fiscal
 * Enviada" describes it (developers.mercadolivre.com.br/pt_br/importar-nota-fiscal): the order
 * gives its shipment, `GET /shipments/{id}/invoice_data?siteId=MLB` gives the note's key. In venda
 * à ordem, the reseller's own ERP (UpSeller, Bling) sends that note; SellBridge only reads it.
 */

const orderShipmentSchema = z.object({
  seller: z.object({ id: externalIdSchema }),
  shipping: z.object({ id: externalIdSchema.nullish() }).nullish(),
});

const invoiceDataSchema = z.object({
  fiscal_key: z.string().nullish(),
  invoice_date: z.string().nullish(),
});

/** The answer when the shipment has no note yet. */
const NOT_FOUND = 404;

function isNotFound(error: unknown): boolean {
  return isAppError(error) && error.details.status === NOT_FOUND;
}

function issuedAt(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function shipmentIdOf(
  context: Parameters<typeof requestJson>[0],
  store: StoreCredentials,
  orderId: string,
): Promise<string | null> {
  const order = await requestJson(context, {
    schema: orderShipmentSchema,
    path: `/orders/${orderId}`,
    init: { accessToken: store.accessToken },
  });
  if (String(order.seller.id) !== store.externalShopId) {
    throw marketplaceError("Pedido não pertence à loja conectada", { retryable: false });
  }
  const shipmentId = order.shipping?.id;
  return shipmentId === null || shipmentId === undefined ? null : String(shipmentId);
}

/**
 * The note attached to the order's shipment, or null while there is none (no shipment yet, or the
 * seller has not sent the note). The key comes as Mercado Livre gives it: the caller checks it.
 */
export async function readMercadoLivreSaleInvoice(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
): Promise<MarketplaceSaleInvoice | null> {
  if (!/^\d+$/.test(orderId)) {
    throw marketplaceError("Número de pedido inválido", { retryable: false });
  }
  const context = {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
  const shipmentId = await shipmentIdOf(context, store, orderId);
  if (shipmentId === null) {
    return null;
  }
  return shipmentInvoice(context, store, shipmentId);
}

async function shipmentInvoice(
  context: Parameters<typeof requestJson>[0],
  store: StoreCredentials,
  shipmentId: string,
): Promise<MarketplaceSaleInvoice | null> {
  try {
    const invoice = await requestJson(context, {
      schema: invoiceDataSchema,
      path: `/shipments/${encodeURIComponent(shipmentId)}/invoice_data?siteId=MLB`,
      init: { accessToken: store.accessToken },
    });
    const accessKey = invoice.fiscal_key?.trim() ?? "";
    if (accessKey === "") {
      return null;
    }
    return { accessKey, issuedAt: issuedAt(invoice.invoice_date) };
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

const SALE_INVOICE_URL = "https://api.mercadolibre.com/shipments";

/**
 * Mercado Livre's refusals of an imported note ("Importar Nota Fiscal › Referências de código de
 * erro"), in the reseller's words. Any other code gets the generic message.
 */
const SALE_INVOICE_REFUSALS: Readonly<Record<string, string>> = {
  invalid_sender_cnpj:
    "O Mercado Livre recusou a nota: ela precisa ser da empresa dona da loja, com o mesmo CNPJ.",
  wrong_sender_zipcode:
    "O Mercado Livre recusou a nota: o CEP de quem emitiu é diferente do CEP de onde o pacote sai. Fale com o suporte do SellBridge.",
  different_state_nfe_shipment_origin:
    "O Mercado Livre recusou a nota: o estado de quem emitiu é diferente do estado de onde o pacote sai. Fale com o suporte do SellBridge.",
  invalid_nfe_cstat:
    "O Mercado Livre recusou a nota: ela ainda não foi autorizada pela SEFAZ. Envie o XML da nota autorizada.",
  duplicated_fiscal_key:
    "Esta nota já foi usada em outro pedido do Mercado Livre. Envie a nota deste pedido.",
};
const GENERIC_REFUSAL =
  "O Mercado Livre não aceitou a nota agora. Confira se o pedido ainda espera a nota e tente de novo em alguns minutos.";

const refusalBodySchema = z.object({ error: z.string().optional() }).loose();

async function refusalCode(response: Response): Promise<string | null> {
  const body = refusalBodySchema.safeParse(await response.json().catch(() => null));
  return body.success ? (body.data.error ?? null) : null;
}

/**
 * Sends the reseller's own sale note (its authorized XML) to the order's shipment, as "Importar
 * Nota Fiscal" asks: `POST /shipments/{id}/invoice_data?siteId=MLB` with the `nfeProc` as body.
 * Without it, drop-off and cross-docking labels never come out.
 *
 * @throws {AppError} EXTERNAL_PROVIDER, not retryable, with the reason in the reseller's words when
 * Mercado Livre refuses it or the order has no shipment; retryable when it is busy.
 */
export async function sendMercadoLivreSaleInvoice(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  input: { orderId: string; accessKey: string; xml: string },
): Promise<void> {
  if (!/^\d+$/.test(input.orderId)) {
    throw marketplaceError("Número de pedido inválido", { retryable: false });
  }
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const context = { config, fetchImplementation, now: config.now ?? (() => new Date()) };
  const shipmentId = await shipmentIdOf(context, store, input.orderId);
  if (shipmentId === null) {
    throw marketplaceError(
      "O pedido ainda não tem envio no Mercado Livre. Tente de novo mais tarde.",
      {
        retryable: false,
      },
    );
  }
  // An earlier send whose answer was lost may have saved it: sending again would be "duplicated".
  const attached = await shipmentInvoice(context, store, shipmentId);
  if (attached?.accessKey === input.accessKey) {
    return;
  }
  const response = await fetchImplementation(
    `${SALE_INVOICE_URL}/${encodeURIComponent(shipmentId)}/invoice_data?siteId=MLB`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${store.accessToken}`,
        "content-type": "application/xml",
      },
      body: input.xml,
    },
  );
  if (response.ok) {
    return;
  }
  const code = await refusalCode(response);
  const refusal = code === null ? undefined : SALE_INVOICE_REFUSALS[code];
  throw marketplaceError(refusal ?? GENERIC_REFUSAL, {
    retryable: response.status === 429 || response.status >= 500,
    status: response.status,
    ...(code === null ? {} : { causes: [code] }),
  });
}
