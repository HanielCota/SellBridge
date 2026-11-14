import { marketplaceError } from "../errors.ts";
import type { StoreCredentials } from "../types.ts";
import { requestShop, type TikTokShopContext } from "./client.ts";
import { orderPackageIds } from "./orders.ts";
import { shippingDocumentSchema } from "./schemas.ts";
import { shopCipher } from "./shops.ts";

export interface TikTokShopLabel {
  /** Download link of the PDF label, valid for 24 hours. */
  readonly url: string;
  readonly trackingNumber: string | null;
}

/**
 * The shipping label of an order's first package (Get Package Shipping Document). It exists only
 * after the shipment is arranged on TikTok Shop; before that, TikTok refuses with a code that
 * `error-messages.ts` explains in Portuguese. SellBridge does not arrange the shipment itself.
 * [live test] the arrange-shipment step in the supplier's flow.
 */
export async function getTikTokShopLabel(
  context: TikTokShopContext,
  store: StoreCredentials,
  orderId: string,
): Promise<TikTokShopLabel> {
  const [packageId] = await orderPackageIds(context, store, orderId);
  if (packageId === undefined) {
    throw marketplaceError(
      "O pedido ainda não tem pacote no TikTok Shop. Organize o envio no TikTok Shop antes de baixar a etiqueta.",
      { retryable: false },
    );
  }
  const document = await requestShop(context, {
    schema: shippingDocumentSchema,
    method: "GET",
    path: `/fulfillment/202309/packages/${encodeURIComponent(packageId)}/shipping_documents`,
    accessToken: store.accessToken,
    shopCipher: await shopCipher(context, store),
    query: { document_type: "SHIPPING_LABEL", document_format: "PDF" },
  });
  return { url: document.doc_url, trackingNumber: document.tracking_number ?? null };
}
