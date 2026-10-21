import { z } from "zod";
import { deliveryAddressSchema, type MarketplaceTrackingStatus } from "@sellbridge/shared/schemas";
import type { StoreCredentials } from "../types.ts";
import { marketplaceError } from "../errors.ts";
import { fetchWithRetry } from "../http.ts";
import { requestJson, type MercadoLivreConfig, type MercadoLivreContext } from "./client.ts";
import { externalIdSchema, presentTextSchema } from "./schemas.ts";

const MAX_LABEL_BYTES = 10 * 1024 * 1024;

const remoteAddressSchema = z.object({
  receiver_name: z.string().nullable().optional(),
  street_name: z.string(),
  street_number: z.union([z.string(), z.number()]),
  zip_code: z.string(),
  comment: z.string().nullable().optional(),
  neighborhood: z.object({ name: z.string().nullable() }).nullable().optional(),
  city: z.object({ name: z.string() }),
  state: z.object({ id: z.string(), name: z.string().optional() }),
});
const shippingSchema = z.object({
  // A rounded shipment id names another shipment (and another label): safe integers only.
  id: externalIdSchema,
  status: z.string(),
  type: z.string().optional(),
  substatus: z.string().nullable().optional(),
  mode: z.string(),
  logistic_type: z.string(),
  tracking_number: presentTextSchema,
  tracking_method: presentTextSchema,
  receiver_address: remoteAddressSchema.nullable().optional(),
  // Read on its own (`deliveryTimes`): a malformed estimate must not block the whole shipment.
  lead_time: z.unknown().optional(),
  destination: z
    .object({
      receiver_name: z.string().nullable().optional(),
      shipping_address: remoteAddressSchema.nullable().optional(),
    })
    .optional(),
});
const shippingOrderSchema = z.object({
  seller: z.object({ id: externalIdSchema }),
});
/** Hosted View of `GET /orders/{id}/shipments`: ids and types only; 204 (no body) until created. */
const shipmentRefsSchema = z.array(z.object({ id: externalIdSchema, type: z.string() })).nullable();

/**
 * A dated node of `lead_time`, as the "Mercado Envios" pages show it. The estimate's `type` says
 * how firm it is: "unknown" and "unknown_frame" dates are placeholders, never an estimate.
 */
const leadTimeDateSchema = z.object({
  type: z.string().optional(),
  date: z.iso.datetime({ offset: true }),
});
const leadTimeSchema = z.object({
  estimated_delivery_time: z.unknown().optional(),
  estimated_handling_limit: z.unknown().optional(),
});

/** One node read on its own: a malformed estimate never hides a valid deadline. */
function leadTimeDate(node: unknown): Date | null {
  const parsed = leadTimeDateSchema.safeParse(node);
  if (!parsed.success || parsed.data.type?.startsWith("unknown") === true) {
    return null;
  }
  return new Date(parsed.data.date);
}

/** The delivery estimate and the dispatch deadline of a shipment (`lead_time`), when known. */
function deliveryTimes(leadTime: unknown) {
  const parsed = leadTimeSchema.safeParse(leadTime ?? {});
  if (!parsed.success) {
    return { estimatedDeliveryAt: null, dispatchDeadlineAt: null };
  }
  return {
    estimatedDeliveryAt: leadTimeDate(parsed.data.estimated_delivery_time),
    dispatchDeadlineAt: leadTimeDate(parsed.data.estimated_handling_limit),
  };
}

/** `not_delivered` substatuses that mean the parcel is back with the seller, not just failed. */
const RETURNED_SUBSTATUSES = new Set([
  "returned",
  "returned_to_warehouse",
  "returned_to_hub",
  "returned_to_agency",
]);

/**
 * What the shipment says once the parcel left the supplier; null while it has not (pending,
 * handling, ready_to_ship), when the supplier's own steps are the better account, and for
 * statuses this table does not know. Source: `GET /shipment_statuses`, gerenciamento-de-envios.
 */
export function shipmentTrackingStatus(
  status: string,
  substatus: string | null,
): MarketplaceTrackingStatus | null {
  if (status === "shipped" || status === "stale_shipped") return "shipped";
  if (status === "delivered") return "delivered";
  if (status === "cancelled") return "cancelled";
  if (status !== "not_delivered") return null;
  return substatus !== null && RETURNED_SUBSTATUSES.has(substatus) ? "returned" : "not_delivered";
}
function shippingContext(config: MercadoLivreConfig): MercadoLivreContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
}
/** The order's sale shipment (and the list it came from), checked to belong to the store. */
async function loadSaleShipment(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
) {
  if (!/^\d+$/.test(orderId))
    throw marketplaceError("Número de pedido inválido", { retryable: false });
  const context = shippingContext(config);
  const order = await requestJson(context, {
    schema: shippingOrderSchema,
    path: `/orders/${orderId}`,
    init: { accessToken: store.accessToken },
  });
  if (String(order.seller.id) !== store.externalShopId)
    throw marketplaceError("Pedido não pertence à loja conectada", { retryable: false });
  // Hosted View (official Orders docs; the full view was retired at the end of September 2026):
  // the list holds only ids and types, in no promised order, so the sale is picked by type.
  const refs = await requestJson(context, {
    schema: shipmentRefsSchema,
    path: `/orders/${orderId}/shipments`,
    init: { accessToken: store.accessToken },
  });
  if (refs === null)
    throw marketplaceError(
      "O Mercado Livre ainda não criou o envio deste pedido. Tente de novo em alguns minutos.",
      { retryable: false },
    );
  const forward = refs.filter((ref) => ref.type === "forward");
  const [sale] = forward;
  if (forward.length !== 1 || !sale)
    throw marketplaceError("O pedido precisa ter um único envio de compra para esta operação", {
      retryable: false,
    });
  const raw = await requestJson(context, {
    schema: shippingSchema,
    path: `/shipments/${encodeURIComponent(String(sale.id))}`,
    init: { accessToken: store.accessToken, headers: { "x-format-new": "true" } },
  });
  const parsedAddress = parseDeliveryAddress(raw);
  const shipping = {
    shipmentId: String(raw.id),
    status: raw.status,
    substatus: raw.substatus ?? null,
    trackingStatus: shipmentTrackingStatus(raw.status, raw.substatus ?? null),
    mode: raw.mode,
    logisticType: raw.logistic_type,
    trackingCode: raw.tracking_number ?? null,
    carrier: raw.tracking_method ?? null,
    address: parsedAddress?.success ? parsedAddress.data : null,
    ...deliveryTimes(raw.lead_time),
  };
  return { context, refs, shipping };
}

/**
 * Whether a buyer's return parcel (`type: "return"`, sent to the seller) already arrived. Only
 * read when the order has one; a return re-sent to the buyer (`return_to_buyer`) does not count.
 */
async function buyerReturnDelivered(
  context: MercadoLivreContext,
  store: StoreCredentials,
  refs: readonly { id: number | string; type: string }[],
): Promise<boolean> {
  const returns = await Promise.all(
    refs
      .filter((ref) => ref.type === "return")
      .map((ref) =>
        requestJson(context, {
          schema: z.object({ status: z.string() }),
          path: `/shipments/${encodeURIComponent(String(ref.id))}`,
          init: { accessToken: store.accessToken, headers: { "x-format-new": "true" } },
        }),
      ),
  );
  return returns.some((parcel) => parcel.status === "delivered");
}

export async function getMercadoLivreShipping(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
) {
  const { context, refs, shipping } = await loadSaleShipment(config, store, orderId);
  return { ...shipping, buyerReturnDelivered: await buyerReturnDelivered(context, store, refs) };
}
export async function getMercadoLivreLabel(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
) {
  const { shipping } = await loadSaleShipment(config, store, orderId);
  const allowed = ["drop_off", "xd_drop_off", "cross_docking", "self_service"];
  if (shipping.mode !== "me2" || !allowed.includes(shipping.logisticType))
    throw marketplaceError("Este tipo de envio não permite emitir etiqueta de postagem", {
      retryable: false,
    });
  if (
    shipping.status !== "ready_to_ship" ||
    !["ready_to_print", "printed"].includes(shipping.substatus ?? "")
  )
    throw marketplaceError("A etiqueta ainda não está disponível para impressão no Mercado Livre", {
      retryable: false,
    });
  const response = await fetchWithRetry(
    config.fetchImplementation ?? fetch,
    `https://api.mercadolibre.com/shipment_labels?shipment_ids=${encodeURIComponent(shipping.shipmentId)}&response_type=pdf`,
    { headers: { authorization: `Bearer ${store.accessToken}` } },
    // A label is a PDF of up to 10 MB. The 30s deadline is per attempt: a caller signal shared by
    // every attempt fired in the middle of the second one and read as "cancelled".
    { ...config.retry, timeoutMilliseconds: 30_000, maxBodyBytes: MAX_LABEL_BYTES },
  );
  if (!response.ok)
    throw marketplaceError(`Não foi possível emitir a etiqueta (HTTP ${response.status})`, {
      status: response.status,
      retryable: response.status >= 500,
    });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_LABEL_BYTES || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw marketplaceError("O marketplace não retornou uma etiqueta PDF válida", {
      retryable: false,
    });
  return bytes;
}

function parseDeliveryAddress(raw: z.infer<typeof shippingSchema>) {
  const address = raw.destination?.shipping_address ?? raw.receiver_address;
  const parsedAddress = address
    ? deliveryAddressSchema.safeParse({
        recipient: raw.destination?.receiver_name ?? address.receiver_name ?? "",
        street: address.street_name,
        number: String(address.street_number),
        complement: address.comment ?? "",
        postalCode: address.zip_code,
        neighborhood: address.neighborhood?.name ?? "",
        city: address.city.name,
        state: address.state.id.replace(/^BR-/, ""),
      })
    : null;
  return parsedAddress;
}
