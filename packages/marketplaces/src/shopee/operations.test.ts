import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { hasMarketplaceCause, LABEL_NOT_READY_CAUSE } from "../errors.ts";
import type { DownloadImage } from "../tiktok-shop/image-download.ts";
import { createShopeeConnector, getShopeeShippingLabel } from "./shopee-connector.ts";
import {
  fakeShopee,
  jsonResponse,
  PARTNER_ID,
  PARTNER_KEY,
  refusal,
  type Responder,
} from "./testing/fake-shopee.ts";

const NOW = new Date("2026-11-26T13:00:00Z");
const STORE = { accessToken: "test-token", externalShopId: "727720655" };
const CALLBACK = "https://sellbridge.test/api/webhooks/shopee";
const SERIAL = "261126E81SYYKE";
const PACKAGE = "60489687088750";
const ITEM_ID = 3_000_142_341;
const PRODUCT = {
  idempotencyKey: "target-123",
  title: "Mochila de viagem azul",
  description: "Mochila de viagem esportiva com bolsos internos.",
  priceCents: 10_990,
  sku: "MOCHILA-AZUL",
  stock: 3,
  imageUrls: ["https://images.example.com/mochila.png"],
  packageWeightGrams: 650,
  mercadoLivreAttributes: {
    COLOR: "Azul",
    BRAND: "Marca Exemplo",
    SELLER_PACKAGE_HEIGHT: "30 cm",
    SELLER_PACKAGE_WIDTH: "12 cm",
    SELLER_PACKAGE_LENGTH: "45 cm",
  },
  productFiscal: { ncm: "42029200", origin: 0, unit: "UN", cest: null },
} as const;

function success(response: unknown) {
  return jsonResponse({ request_id: "req-1", error: "", response });
}

function setup(routes: Record<string, Responder> = {}) {
  const api = fakeShopee(routes);
  const config = {
    partnerId: PARTNER_ID,
    partnerKey: PARTNER_KEY,
    webhookUrl: CALLBACK,
    fetchImplementation: api.fetchImplementation,
    now: () => NOW,
    retry: { retries: 0 },
    downloadImage: vi.fn<DownloadImage>(async () => ({
      status: 200,
      contentType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    })),
  };
  return { ...api, config, connector: createShopeeConnector(config) };
}

const catalogRoutes = {
  "GET /api/v2/logistics/get_channel_list": () =>
    success({
      logistics_channel_list: [
        { logistics_channel_id: 90001, enabled: true, fee_type: "SIZE_INPUT" },
        { logistics_channel_id: 90002, enabled: false, fee_type: "FIXED_DEFAULT_PRICE" },
      ],
    }),
  "POST /api/v2/media_space/upload_image": () => success({ image_info: { image_id: "cover-1" } }),
  "GET /api/v2/product/category_recommend": () => success({ category_id: [100_021] }),
  "GET /api/v2/product/get_attribute_tree": () =>
    success({
      list: [
        {
          category_id: 100_021,
          attribute_tree: [
            {
              attribute_id: 30,
              name: "Cor",
              mandatory: true,
              attribute_info: { input_type: 1 },
              attribute_value_list: [{ value_id: 15, name: "Azul" }],
            },
          ],
        },
      ],
    }),
  "GET /api/v2/product/get_brand_list": () =>
    success({
      brand_list: [{ brand_id: 50, original_brand_name: "Marca Exemplo" }],
      has_next_page: false,
    }),
};

function successfulUpdate() {
  return success({ failure_list: [], success_list: [{ model_id: 0 }] });
}

describe("Shopee listing and stock", () => {
  it("uploads a photo and publishes the listing with its required data", async () => {
    const beforeCreate = vi.fn<() => Promise<void>>(async () => undefined);
    const { connector, calls } = setup({
      ...catalogRoutes,
      "POST /api/v2/product/add_item": () => success({ item_id: ITEM_ID }),
    });

    const result = await connector.publishProduct(STORE, PRODUCT, {
      creationStartedAt: null,
      beforeCreate,
      creationRejected: vi.fn<() => Promise<void>>(),
      creationAbsent: vi.fn<() => Promise<void>>(),
    });

    expect(result.externalId).toBe(String(ITEM_ID));
    expect(beforeCreate).toHaveBeenCalledOnce();
    const upload = calls.find((call) => call.path.endsWith("/upload_image"));
    expect(upload?.query.has("access_token")).toBe(false);
    expect(upload?.form?.get("scene")).toBe("normal");
    expect(upload?.form?.get("image")).toBeInstanceOf(Blob);
    expect(calls.at(-1)?.json).toMatchObject({
      item_sku: expect.stringMatching(/^SB-[a-f\d]{24}$/),
      item_name: PRODUCT.title,
      weight: 0.65,
      dimension: { package_height: 30, package_width: 12, package_length: 45 },
      original_price: 109.9,
      image: { image_id_list: ["cover-1"] },
      logistic_info: [{ logistic_id: 90001, enabled: true }],
      attribute_list: [{ attribute_id: 30, attribute_value_list: [{ value_id: 15 }] }],
      brand: { brand_id: 50, original_brand_name: "Marca Exemplo" },
      tax_info: { ncm: "42029200" },
      seller_stock: [{ stock: 3 }],
    });
  });

  it("recovers a previously created item without creating a duplicate", async () => {
    const beforeCreate = vi.fn<() => Promise<void>>(async () => undefined);
    const { connector, calls } = setup({
      "GET /api/v2/product/search_item": () => success({ item_id_list: [ITEM_ID], total_count: 1 }),
    });

    const result = await connector.publishProduct(STORE, PRODUCT, {
      creationStartedAt: NOW,
      beforeCreate,
      creationRejected: vi.fn<() => Promise<void>>(),
      creationAbsent: vi.fn<() => Promise<void>>(),
    });

    expect(result).toMatchObject({ externalId: String(ITEM_ID), recovered: true });
    expect(beforeCreate).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query.get("item_sku")).toMatch(/^SB-[a-f\d]{24}$/);
  });

  it("blocks photo requests to private addresses before creation", async () => {
    const { connector, config, calls } = setup(catalogRoutes);

    await expect(
      connector.publishProduct(STORE, {
        ...PRODUCT,
        imageUrls: ["https://127.0.0.1/hidden.png"],
      }),
    ).rejects.toThrow(/foto 1/);

    expect(config.downloadImage).not.toHaveBeenCalled();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("sends zero stock and a new price using the non-variation model ID", async () => {
    const { connector, calls } = setup({
      "POST /api/v2/product/update_stock": successfulUpdate,
      "POST /api/v2/product/update_price": successfulUpdate,
    });

    await connector.updateStockPrice(STORE, {
      externalId: String(ITEM_ID),
      priceCents: 7_590,
      stock: 0,
    });

    expect(calls.map((call) => call.json)).toEqual([
      { item_id: ITEM_ID, stock_list: [{ model_id: 0, seller_stock: [{ stock: 0 }] }] },
      { item_id: ITEM_ID, price_list: [{ model_id: 0, original_price: 75.9 }] },
    ]);
  });

  it("fails a sync when Shopee rejects the model inside an HTTP 200", async () => {
    const { connector } = setup({
      "POST /api/v2/product/update_stock": () =>
        success({
          failure_list: [{ model_id: 0, failed_reason: "Reserved stock" }],
          success_list: [],
        }),
    });

    await expect(
      connector.updateStockPrice(STORE, { externalId: String(ITEM_ID), stock: 0 }),
    ).rejects.toThrow(/não confirmou a atualização de estoque/);
  });
});

const RAW_ORDER = {
  order_sn: SERIAL,
  currency: "BRL",
  order_status: "READY_TO_SHIP",
  create_time: Math.floor(NOW.getTime() / 1_000) - 3_600,
  total_amount: 100.98,
  recipient_address: {
    name: "Maria Silva",
    full_address: "Rua Exemplo, 12, Vila Nova, Belo Horizonte",
    district: "Vila Nova",
    city: "Belo Horizonte",
    state: "Minas Gerais",
    zipcode: "30100-001",
  },
  item_list: [
    {
      item_id: ITEM_ID,
      item_name: "Mochila",
      model_id: 0,
      model_quantity_purchased: 2,
      model_original_price: 54.95,
      model_discounted_price: 50.49,
    },
  ],
};

describe("Shopee order intake", () => {
  it("paginates orders, deduplicates serials and maps the shop's paid sale", async () => {
    const { connector, calls } = setup({
      "GET /api/v2/order/get_order_list": ({ query }) =>
        success({
          order_list: [{ order_sn: SERIAL }],
          more: query.get("cursor") === "",
          next_cursor: "next",
        }),
      "GET /api/v2/order/get_order_detail": () => success({ order_list: [RAW_ORDER] }),
      "POST /api/v2/payment/get_escrow_detail_batch": () =>
        success([
          {
            escrow_detail: {
              order_sn: SERIAL,
              order_income: { commission_fee: 5, service_fee: 1.45 },
            },
          },
        ]),
    });

    const page = await connector.listOrders(STORE, new Date(NOW.getTime() - 7_200_000));

    expect(page.resumeFrom).toBeNull();
    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]).toMatchObject({
      externalOrderId: SERIAL,
      status: "paid",
      totalCents: 10_098,
      marketplaceFeeCents: 645,
      shippingAddress: { street: "Rua Exemplo", number: "12", state: "MG" },
      items: [{ externalListingId: String(ITEM_ID), quantity: 2, unitPriceCents: 5_049 }],
    });
    expect(
      calls.find((call) => call.path.endsWith("/get_order_detail"))?.query.get("order_sn_list"),
    ).toBe(SERIAL);
  });

  it("rejects an unrelated order returned for a signed notice", async () => {
    const { connector } = setup({
      "GET /api/v2/order/get_order_detail": () => success({ order_list: [RAW_ORDER] }),
    });

    await expect(connector.fetchOrder(STORE, "OTHER123")).rejects.toThrow(/pedido solicitado/);
  });

  it("verifies the exact callback URL and raw body, then reads the stored order reference", async () => {
    const { connector } = setup();
    const rawBody = JSON.stringify({
      code: 3,
      shop_id: Number(STORE.externalShopId),
      timestamp: 1_790_000_000,
      data: { ordersn: SERIAL, status: "READY_TO_SHIP", update_time: 1_790_000_000 },
    });
    const sign = createHmac("sha256", PARTNER_KEY).update(`${CALLBACK}|${rawBody}`).digest("hex");
    const headers = new Headers({ authorization: sign });

    const result = await connector.verifyWebhook({ headers, rawBody });

    expect(result.valid).toBe(true);
    const event = result.valid ? result.event : null;
    expect(connector.parseStoredOrderEvent(event?.topic ?? "", event?.payload)).toEqual({
      kind: "order",
      externalShopId: STORE.externalShopId,
      resource: SERIAL,
    });
    expect((await connector.verifyWebhook({ headers, rawBody: rawBody + " " })).valid).toBe(false);
  });
});

describe("Shopee label", () => {
  const parcel = { order_sn: SERIAL, package_number: PACKAGE };
  const orderDetail = (status: string) =>
    success({
      order_list: [
        {
          order_sn: SERIAL,
          order_status: status,
          split_up: false,
          package_list: [{ package_number: PACKAGE }],
        },
      ],
    });

  it("arranges drop-off, requests the PDF and downloads the original provider file", async () => {
    let documentRequested = false;
    const { config, calls } = setup({
      "GET /api/v2/order/get_order_detail": () => orderDetail("READY_TO_SHIP"),
      "GET /api/v2/logistics/get_shipping_parameter": () =>
        success({ info_needed: { dropoff: [] } }),
      "POST /api/v2/logistics/ship_order": () =>
        jsonResponse({ request_id: "req-ship", error: "" }),
      "POST /api/v2/logistics/get_shipping_document_result": () =>
        success({
          result_list: [
            {
              ...parcel,
              ...(documentRequested
                ? { status: "READY" }
                : { fail_error: "logistics.shipping_document_should_print_first" }),
            },
          ],
        }),
      "GET /api/v2/logistics/get_tracking_number": () => success({ tracking_number: "BR001" }),
      "POST /api/v2/logistics/get_shipping_document_parameter": () =>
        success({
          result_list: [{ ...parcel, selectable_shipping_document_type: ["NORMAL_AIR_WAYBILL"] }],
        }),
      "POST /api/v2/logistics/create_shipping_document": () => {
        documentRequested = true;
        return success({ result_list: [parcel] });
      },
      "POST /api/v2/logistics/download_shipping_document": () =>
        new Response("%PDF-1.7\n", { headers: { "content-type": "application/octet-stream" } }),
    });

    const label = await getShopeeShippingLabel(config, STORE, SERIAL);

    expect(label.packageId).toBe(PACKAGE);
    expect(Buffer.from(label.bytes).toString()).toBe("%PDF-1.7\n");
    expect(calls.find((call) => call.path.endsWith("/ship_order"))?.json).toEqual({
      order_sn: SERIAL,
      dropoff: {},
    });
    expect(calls.find((call) => call.path.endsWith("/create_shipping_document"))?.json).toEqual({
      order_list: [
        { ...parcel, shipping_document_type: "NORMAL_AIR_WAYBILL", tracking_number: "BR001" },
      ],
    });
  });

  it("reports a pending document without creating another copy or downloading it", async () => {
    const { config, calls } = setup({
      "GET /api/v2/order/get_order_detail": () => orderDetail("PROCESSED"),
      "POST /api/v2/logistics/get_shipping_document_result": () =>
        success({
          result_list: [{ ...parcel, status: "PROCESSING" }],
        }),
    });

    const error = await getShopeeShippingLabel(config, STORE, SERIAL).catch(
      (failure: unknown) => failure,
    );

    expect(hasMarketplaceCause(error, LABEL_NOT_READY_CAUSE)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("reports the required invoice when the shop cannot arrange the shipment yet", async () => {
    const { config } = setup({
      "GET /api/v2/order/get_order_detail": () => orderDetail("READY_TO_SHIP"),
      "GET /api/v2/logistics/get_shipping_parameter": () =>
        success({ info_needed: { dropoff: [] } }),
      "POST /api/v2/logistics/ship_order": () =>
        refusal("logistics.lack_of_invoice_data", "pending invoice"),
    });

    await expect(getShopeeShippingLabel(config, STORE, SERIAL)).rejects.toThrow(/Envie a NF-e/);
  });
});
