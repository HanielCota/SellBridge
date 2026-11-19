import type { FetchLike, TikTokShopConfig } from "@sellbridge/marketplaces";

/**
 * A stand-in for the TikTok Shop API the web server calls directly (an order's package and its
 * label), so the browser tests never reach the real service. It answers only for this shop and
 * for order numbers starting with `E2E_TIKTOK_SHOP_ORDER_PREFIX`; anything else is refused, as
 * TikTok refuses an unknown order. An order starting with `E2E_TIKTOK_SHOP_UNARRANGED_PREFIX` has
 * no package yet, as before the seller arranges the shipment on TikTok. Shapes follow the official
 * Partner Center pages (Get Authorized Shops, Get Order Detail, Get Package Shipping Document,
 * read on 2026-11-13).
 */
export const E2E_TIKTOK_SHOP_ID = "7000770001234";
export const E2E_TIKTOK_SHOP_ORDER_PREFIX = "5770";
export const E2E_TIKTOK_SHOP_UNARRANGED_PREFIX = "57709";

const API_HOST = "open-api.tiktokglobalshop.com";
const LABEL_HOST = "magelng.bytedance.net";

/** What every label of the stand-in prints. */
function standInTikTokLabel(orderId: string): string {
  return `%PDF-1.4\n% Etiqueta TikTok Shop ${orderId}\n%%EOF`;
}

function envelope(data: unknown): Response {
  return Response.json({ code: 0, message: "Success", request_id: "e2e", data });
}

function refusal(code: number, message: string): Response {
  return Response.json({ code, message, request_id: "e2e", data: null });
}

function knownOrder(id: string | null): id is string {
  return id !== null && id.startsWith(E2E_TIKTOK_SHOP_ORDER_PREFIX);
}

function order(id: string) {
  return {
    id,
    status: "AWAITING_SHIPMENT",
    create_time: 1_794_000_000,
    payment: { currency: "BRL", total_amount: "59.90" },
    packages: id.startsWith(E2E_TIKTOK_SHOP_UNARRANGED_PREFIX) ? [] : [{ id: `PKG${id}` }],
    line_items: [
      {
        id: `LI${id}`,
        sku_id: "1729592969712207012",
        product_id: "1729592969712203232",
        product_name: "Produto de teste",
        sale_price: "59.90",
        currency: "BRL",
        seller_sku: "E2E-1",
      },
    ],
  };
}

export const tiktokShopStandIn: FetchLike = async (input) => {
  const url = new URL(input);
  if (url.host !== API_HOST) {
    return refusal(36009004, "unknown host");
  }
  if (url.pathname === "/authorization/202309/shops") {
    return envelope({
      shops: [
        { id: E2E_TIKTOK_SHOP_ID, name: "Loja TikTok de teste", region: "BR", cipher: "E2E" },
      ],
    });
  }
  if (url.pathname === "/order/202507/orders") {
    const id = url.searchParams.get("ids");
    return knownOrder(id) ? envelope({ orders: [order(id)] }) : envelope({ orders: [] });
  }
  const label = /^\/fulfillment\/202309\/packages\/PKG(\d+)\/shipping_documents$/.exec(
    url.pathname,
  );
  const orderId = label?.[1] ?? null;
  if (knownOrder(orderId)) {
    return envelope({ doc_url: `https://${LABEL_HOST}/e2e/${orderId}.pdf` });
  }
  return refusal(21023035, "Please arrange shipment before retrieving the shipping document.");
};

/** The label link's download: a small PDF for the stand-in's own links, a 404 for any other. */
const downloadStandInLabel: TikTokShopConfig["downloadFile"] = async (url) => {
  const orderId = /^\/e2e\/(\d+)\.pdf$/.exec(url.pathname)?.[1];
  if (url.host !== LABEL_HOST || orderId === undefined) {
    return { status: 404, contentType: "text/plain", bytes: new Uint8Array() };
  }
  return {
    status: 200,
    contentType: "application/pdf",
    bytes: new TextEncoder().encode(standInTikTokLabel(orderId)),
  };
};

/** Keys of no real app: the stand-in answers whatever the signature says. */
export const tiktokShopStandInConfig: TikTokShopConfig = {
  appKey: "e2e-tiktok-key",
  appSecret: "e2e-tiktok-secret",
  serviceId: "e2e-tiktok-service",
  fetchImplementation: tiktokShopStandIn,
  downloadFile: downloadStandInLabel,
  retry: { retries: 0 },
};
