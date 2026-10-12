import { z } from "zod";
import { deliveryAddressSchema } from "@sellbridge/shared/schemas";
import type { StoreCredentials } from "../types.ts";
import { marketplaceError } from "../errors.ts";
import { fetchWithRetry } from "../http.ts";
import { requestJson, type MercadoLivreConfig, type MercadoLivreContext } from "./client.ts";

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
  id: z.union([z.number(), z.string()]),
  status: z.string(),
  type: z.string().optional(),
  substatus: z.string().nullable().optional(),
  mode: z.string(),
  logistic_type: z.string(),
  tracking_number: z.string().nullable().optional(),
  tracking_method: z.string().nullable().optional(),
  receiver_address: remoteAddressSchema.nullable().optional(),
  destination: z
    .object({
      receiver_name: z.string().nullable().optional(),
      shipping_address: remoteAddressSchema.nullable().optional(),
    })
    .optional(),
});
const shippingOrderSchema = z.object({
  seller: z.object({ id: z.union([z.string(), z.number()]) }),
});
function shippingContext(config: MercadoLivreConfig): MercadoLivreContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
}
export async function getMercadoLivreShipping(
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
  // Hosted shipment view, including recipient PII (official Orders docs, 2026-08-07).
  const response = await requestJson(context, {
    schema: z.union([shippingSchema, z.array(shippingSchema)]),
    path: `/orders/${orderId}/shipments?views=destination`,
    init: {
      accessToken: store.accessToken,
      headers: { "x-new-domain": "true", "x-api-version": "2" },
    },
  });
  const shipments = Array.isArray(response)
    ? response.filter(
        (shipment) => shipment.type !== "return" && shipment.type !== "return_to_buyer",
      )
    : [response];
  const raw = shipments[0];
  if (shipments.length !== 1 || !raw)
    throw marketplaceError("O pedido precisa ter um único envio de compra para esta operação", {
      retryable: false,
    });
  const parsedAddress = parseDeliveryAddress(raw);
  return {
    shipmentId: String(raw.id),
    status: raw.status,
    substatus: raw.substatus ?? null,
    mode: raw.mode,
    logisticType: raw.logistic_type,
    trackingCode: raw.tracking_number ?? null,
    carrier: raw.tracking_method ?? null,
    address: parsedAddress?.success ? parsedAddress.data : null,
  };
}
export async function getMercadoLivreLabel(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
) {
  const shipping = await getMercadoLivreShipping(config, store, orderId);
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
    {
      headers: { authorization: `Bearer ${store.accessToken}` },
      signal: AbortSignal.timeout(30000),
    },
    config.retry,
  );
  if (!response.ok)
    throw marketplaceError(`Não foi possível emitir a etiqueta (HTTP ${response.status})`, {
      status: response.status,
      retryable: response.status >= 500,
    });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
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
