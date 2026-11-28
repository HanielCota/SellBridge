import type { FetchLike, ShopeeConfig } from "@sellbridge/marketplaces";

/**
 * A stand-in for the Shopee Open Platform calls the web server makes for a label (order detail,
 * shipping parameters, ship order, shipping document), so the browser tests never reach Shopee.
 * Every order is ready to ship with a carrier pickup. The shop's pickup addresses are its default
 * one and the supplier's (`E2E_SHOPEE_SUPPLIER_ADDRESS`), except for orders starting with
 * `E2E_SHOPEE_NO_PICKUP_PREFIX`, whose shop only has the default one. Shapes follow the official
 * v2.logistics.get_shipping_parameter and v2.order.get_order_detail pages (read on 2026-11-27).
 */
export const E2E_SHOPEE_SHOP_ID = "880077001";
export const E2E_SHOPEE_ORDER_PREFIX = "E2ESHP";
export const E2E_SHOPEE_NO_PICKUP_PREFIX = "E2ESHPX";
/** The supplier's fiscal address the tests save, which the shop also has as a pickup address. */
export const E2E_SHOPEE_SUPPLIER_ADDRESS = {
  cep: "35500-024",
  street: "Rua Goiás",
  number: "120",
  complement: "",
  neighborhood: "Centro",
  city: "Divinópolis",
  state: "MG",
  ibgeCode: "3122306",
} as const;

const API_HOST = "openplatform.shopee.com.br";
const PICKUP_DATE_IN_SECONDS = 1_795_000_000;
/** Orders whose pickup was scheduled: their package then reads as arranged. */
const arranged = new Set<string>();

function success(response: unknown): Response {
  return Response.json({ request_id: "e2e", error: "", message: "", response });
}

function refusal(error: string, message: string): Response {
  return Response.json({ request_id: "e2e", error, message });
}

function orderNumberOf(url: URL, body: unknown): string {
  const fromQuery = url.searchParams.get("order_sn") ?? url.searchParams.get("order_sn_list");
  if (fromQuery !== null) {
    return fromQuery;
  }
  const json = typeof body === "string" && body !== "" ? (JSON.parse(body) as unknown) : null;
  const sn: unknown =
    json !== null && typeof json === "object" ? Reflect.get(json, "order_sn") : undefined;
  return typeof sn === "string" ? sn : "";
}

function pickupAddresses(orderNumber: string) {
  const shopDefault = {
    address_id: 1_001,
    address_flag: ["default_address", "return_address"],
    address: "Avenida Paulista, 1000",
    district: "Bela Vista",
    city: "São Paulo",
    state: "SP",
    zipcode: "01310-100",
    time_slot_list: [{ pickup_time_id: "e2e-slot-a", date: PICKUP_DATE_IN_SECONDS }],
  };
  if (orderNumber.startsWith(E2E_SHOPEE_NO_PICKUP_PREFIX)) {
    return [shopDefault];
  }
  const supplier = E2E_SHOPEE_SUPPLIER_ADDRESS;
  return [
    shopDefault,
    {
      address_id: 2_002,
      address_flag: ["pickup_address"],
      address: `${supplier.street}, ${supplier.number}`,
      district: supplier.neighborhood,
      city: supplier.city,
      state: supplier.state,
      zipcode: supplier.cep,
      time_slot_list: [
        {
          pickup_time_id: "e2e-slot-b",
          date: PICKUP_DATE_IN_SECONDS,
          time_text: "9h às 12h",
          flags: ["recommended"],
        },
      ],
    },
  ];
}

function orderDetail(orderNumber: string): Response {
  return success({
    order_list: [
      {
        order_sn: orderNumber,
        order_status: "READY_TO_SHIP",
        split_up: false,
        package_list: [
          {
            package_number: `PKG${orderNumber}`,
            logistics_status: arranged.has(orderNumber)
              ? "LOGISTICS_REQUEST_CREATED"
              : "LOGISTICS_READY",
          },
        ],
      },
    ],
  });
}

const routes: Record<string, (orderNumber: string) => Response> = {
  "/api/v2/order/get_order_detail": orderDetail,
  "/api/v2/logistics/get_shipping_parameter": (orderNumber) =>
    success({
      info_needed: { pickup: ["address_id", "pickup_time_id"] },
      pickup: { address_list: pickupAddresses(orderNumber) },
    }),
  "/api/v2/logistics/ship_order": (orderNumber) => {
    arranged.add(orderNumber);
    return Response.json({ request_id: "e2e", error: "" });
  },
  "/api/v2/logistics/get_shipping_document_result": (orderNumber) =>
    success({
      result_list: [
        { order_sn: orderNumber, package_number: `PKG${orderNumber}`, status: "READY" },
      ],
    }),
  "/api/v2/logistics/download_shipping_document": (orderNumber) =>
    new Response(`%PDF-1.4\n% Etiqueta Shopee ${orderNumber}\n%%EOF`, {
      headers: { "content-type": "application/pdf" },
    }),
};

function orderOfDownload(body: unknown): string {
  const json = typeof body === "string" ? (JSON.parse(body) as unknown) : null;
  const list: unknown =
    json !== null && typeof json === "object" ? Reflect.get(json, "order_list") : null;
  const first: unknown = Array.isArray(list) ? list[0] : null;
  const sn: unknown =
    first !== null && typeof first === "object" ? Reflect.get(first, "order_sn") : null;
  return typeof sn === "string" ? sn : "";
}

export const shopeeStandIn: FetchLike = async (input, init) => {
  const url = new URL(input);
  const route = routes[url.pathname];
  if (url.host !== API_HOST || route === undefined) {
    return refusal("error_not_found", "Wrong parameters, detail: unknown call.");
  }
  const body = init?.body;
  const orderNumber =
    url.pathname.endsWith("/get_shipping_document_result") ||
    url.pathname.endsWith("/download_shipping_document")
      ? orderOfDownload(body)
      : orderNumberOf(url, body);
  if (!orderNumber.startsWith(E2E_SHOPEE_ORDER_PREFIX)) {
    return refusal("error_not_found", "Wrong parameters, detail: order not found.");
  }
  return route(orderNumber);
};

/** Keys of no real app: the stand-in answers whatever the signature says. */
export const shopeeStandInConfig: ShopeeConfig = {
  partnerId: "2001887",
  partnerKey: "e2e-shopee-key",
  fetchImplementation: shopeeStandIn,
  retry: { retries: 0 },
};
