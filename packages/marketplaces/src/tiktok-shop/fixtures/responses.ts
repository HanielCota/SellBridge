/**
 * Responses shaped exactly as the "Response Sample" of each official API reference page (read on
 * 2026-11-13), with Brazilian values (BRL, region BR) where the sample used another market. Only
 * the fields the connector reads are kept, plus a few it must ignore.
 */

export const SHOP_ID = "7000714532876273420";
export const SHOP_CIPHER = "GCP_XF90igAAAABh00qsWgtvOiGFNqyubMt3";
export const PRODUCT_ID = "1729592969712207008";
export const SKU_ID = "1729592969712207012";
export const WAREHOUSE_ID = "7000714532876273410";
export const ORDER_ID = "576461413038785752";
export const PACKAGE_ID = "1152321127278713123";

function envelope<Data>(data: Data) {
  return { code: 0, message: "success", request_id: "2024080809462301024509910319695C45", data };
}

/** Get Access Token / Get Refresh Token ("Authorization overview"). */
export const TOKEN_RESPONSE = envelope({
  access_token:
    "TTP_Fw8rBwAAAAAkW03FYd09DG-9INtpw361hWthei8S3fHX8iPJ5AUv99fLSCYD9-UucaqxTgNRzKZxi5",
  access_token_expire_in: 1660556783,
  refresh_token: "TTP_NTUxZTNhYTQ2ZDk2YmRmZWNmYWY2YWY2YzkxNGYwNjQ3YjkzYTllYjA0YmNlMw",
  refresh_token_expire_in: 1691487031,
  open_id: "7010736057180325637",
  seller_name: "Test Seller",
  seller_base_region: "BR",
  user_type: 0,
  granted_scopes: ["seller.product.basic", "seller.order.info"],
});

/** Get Authorized Shops. */
export const SHOPS_RESPONSE = envelope({
  shops: [
    {
      id: SHOP_ID,
      name: "Loja da Maria",
      region: "BR",
      seller_type: "LOCAL",
      cipher: SHOP_CIPHER,
      code: "BRLCBA4LLU8",
    },
  ],
});

/** Get Warehouse List (address trimmed). */
export const WAREHOUSES_RESPONSE = envelope({
  warehouses: [
    {
      id: "7000714532876273999",
      name: "Devoluções",
      effect_status: "ENABLED",
      type: "RETURN_WAREHOUSE",
      is_default: true,
    },
    {
      id: WAREHOUSE_ID,
      name: "São Paulo",
      effect_status: "ENABLED",
      type: "SALES_WAREHOUSE",
      sub_type: "DOMESTIC_WAREHOUSE",
      is_default: true,
    },
  ],
});

/** Recommend Category. */
export const CATEGORY_RESPONSE = envelope({
  categories: [{ id: "605254", is_leaf: true, level: 1, name: "Teas", permission_statuses: [] }],
  leaf_category_id: "605254",
});

/** Upload Product Image. */
export const IMAGE_RESPONSE = envelope({
  uri: "tos-maliva-i-o3syd03w52-us/c668cdf70b7f483c94dbe",
  url: "https://p-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c668cdf70b7f483c94dbe",
  height: 720,
  width: 720,
  use_case: "MAIN_IMAGE",
});

/** Create Product. */
export const CREATED_PRODUCT_RESPONSE = envelope({
  product_id: PRODUCT_ID,
  skus: [{ id: SKU_ID, seller_sku: "SKU-1", sales_attributes: [], external_sku_id: "" }],
  warnings: [],
});

/** Get Product (trimmed to the SKU part). */
export const PRODUCT_RESPONSE = envelope({
  id: PRODUCT_ID,
  status: "ACTIVATE",
  title: "Chá verde 100 g",
  skus: [
    {
      id: SKU_ID,
      seller_sku: "SKU-1",
      price: { currency: "BRL", sale_price: "59.9", tax_exclusive_price: "59.9" },
      inventory: [{ quantity: 10, warehouse_id: WAREHOUSE_ID }],
    },
  ],
});

/** Update Price / Update Inventory answer an empty `data` on success. */
export const EMPTY_SUCCESS = envelope({});

/** One order of Get Order Detail / Get Order List, as the sample, in BRL. */
export function tiktokOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: "AWAITING_SHIPMENT",
    create_time: 1619611561,
    update_time: 1619621355,
    payment: { currency: "BRL", sub_total: "119.80", shipping_fee: "0", total_amount: "119.80" },
    packages: [{ id: PACKAGE_ID }],
    cpf: "3213-31231412",
    line_items: [
      {
        id: "577086512123755123",
        sku_id: SKU_ID,
        product_id: PRODUCT_ID,
        product_name: "Chá verde 100 g",
        sale_price: "59.9",
        original_price: "69.9",
        currency: "BRL",
        seller_sku: "SKU-1",
      },
      {
        id: "577086512123755124",
        sku_id: SKU_ID,
        product_id: PRODUCT_ID,
        product_name: "Chá verde 100 g",
        sale_price: "59.9",
        original_price: "69.9",
        currency: "BRL",
        seller_sku: "SKU-1",
      },
    ],
    ...overrides,
  };
}

export function orderDetailResponse(orders: readonly unknown[]) {
  return envelope({ orders });
}

export function orderSearchResponse(orders: readonly unknown[], nextPageToken: string) {
  return envelope({ next_page_token: nextPageToken, total_count: orders.length, orders });
}

/** Get Package Shipping Document. */
export const SHIPPING_DOCUMENT_RESPONSE = envelope({
  doc_url: "https://magelng.bytedance.net/wsos_v2/oec_fulfillment_doc_tts/object/wsos641232",
  tracking_number: "752455325694",
});

/** A business refusal: HTTP 200 with a non-zero code ("Common errors"). */
export function refusal(code: number, message: string) {
  return { code, message, request_id: "202203070749000101890810281E8C70B7", data: null };
}
