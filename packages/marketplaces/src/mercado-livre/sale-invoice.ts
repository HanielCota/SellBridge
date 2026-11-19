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
