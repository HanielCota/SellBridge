import { z } from "zod";
import { logger } from "@sellbridge/shared/logger";
import {
  deliveryAddressSchema,
  type LabelFormat,
  type MarketplaceTrackingStatus,
} from "@sellbridge/shared/schemas";
import { type ShippingAddressReading, shippingAddressReading } from "../shipping-address.ts";
import type { StoreCredentials } from "../types.ts";
import { LABEL_NOT_READY_CAUSE, marketplaceError } from "../errors.ts";
import { fetchWithRetry } from "../http.ts";
import { InvalidZipError, isZip, readZipEntries } from "../zip.ts";
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
    throw marketplaceError("Este pedido é de outra conta do Mercado Livre, não desta loja.", {
      retryable: false,
    });
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
    throw marketplaceError(
      "Este pedido não tem um envio só no Mercado Livre, então não dá para tratar por aqui. Faça pelo Mercado Livre.",
      {
        retryable: false,
      },
    );
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

/** `GET /shipments/{id}/sla`: the date and time by which the seller must dispatch the parcel. */
const shipmentSlaSchema = z.object({
  expected_date: z.iso.datetime({ offset: true }).nullable().optional(),
});

/**
 * Shipments the SLA is asked for: still before dispatch, and never Fulfillment or cancelled ones,
 * which Mercado Livre says it has no SLA for (gerenciamento-de-envios, "Prazo máximo de despacho").
 */
const SLA_SHIPMENT_STATUSES = new Set(["pending", "handling", "ready_to_ship"]);

function needsDispatchSla(shipping: { status: string; logisticType: string }): boolean {
  return SLA_SHIPMENT_STATUSES.has(shipping.status) && shipping.logisticType !== "fulfillment";
}

/**
 * The dispatch deadline from the SLA resource. Since 13 May 2025 Mercado Livre serves it there
 * only (`lead_time.estimated_handling_limit` is deprecated). A failed or empty answer is null:
 * the deadline is extra information and never fails the shipment reading.
 */
async function dispatchSlaDate(
  context: MercadoLivreContext,
  store: StoreCredentials,
  shipmentId: string,
): Promise<Date | null> {
  try {
    const sla = await requestJson(context, {
      schema: shipmentSlaSchema,
      path: `/shipments/${encodeURIComponent(shipmentId)}/sla`,
      init: { accessToken: store.accessToken },
    });
    return sla.expected_date == null ? null : new Date(sla.expected_date);
  } catch (error) {
    logger.warn("mercado_livre.shipment_sla_failed", { shipmentId, error });
    return null;
  }
}

export async function getMercadoLivreShipping(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
) {
  const { context, refs, shipping } = await loadSaleShipment(config, store, orderId);
  const returned = await buyerReturnDelivered(context, store, refs);
  const slaDate = needsDispatchSla(shipping)
    ? await dispatchSlaDate(context, store, shipping.shipmentId)
    : null;
  return {
    ...shipping,
    dispatchDeadlineAt: slaDate ?? shipping.dispatchDeadlineAt,
    buyerReturnDelivered: returned,
  };
}
/**
 * The buyer's address from the sale shipment, read by the same calls as `getMercadoLivreShipping`
 * (order, its shipments, the sale shipment) without the return lookups.
 */
export async function readMercadoLivreShippingAddress(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
): Promise<ShippingAddressReading> {
  const { shipping } = await loadSaleShipment(config, store, orderId);
  return shippingAddressReading(shipping.address);
}
/** Labels per `/shipment_labels` call, Mercado Livre's limit for `shipment_ids`. */
const MAX_LABELS_PER_REQUEST = 50;

/** Sale shipments read at once while gathering a batch, so a store is not flooded. */
const LABEL_LOOKUP_CONCURRENCY = 5;

type SaleShipping = Awaited<ReturnType<typeof loadSaleShipment>>["shipping"];

/** Throws unless the sale shipment's label can be printed now. */
function assertLabelPrintable(shipping: SaleShipping): void {
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
      causes: [LABEL_NOT_READY_CAUSE],
    });
}

/** Mercado Livre's `response_type` per label format (Mercado Envios 2, "Imprimir etiquetas"). */
const LABEL_RESPONSE_TYPES: Record<LabelFormat, string> = { pdf: "pdf", zpl: "zpl2" };

const ZPL_LABEL_START = "^XA";

function invalidLabel(format: LabelFormat, cause?: unknown) {
  const name = format === "pdf" ? "PDF" : "ZPL";
  return marketplaceError(
    `O Mercado Livre mandou a etiqueta ${name} com defeito. Tente baixar de novo em alguns minutos.`,
    {
      retryable: false,
      cause,
    },
  );
}

/**
 * The ZPL text of a `zpl2` answer. The docs do not say how it comes: integrations get a ZIP with
 * one text file per document, so both a ZIP and plain ZPL are read, and anything else is refused.
 * Files in the ZIP that are not ZPL are left out.
 */
function zplLabel(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (!isZip(bytes)) {
    const text = new TextDecoder().decode(bytes);
    if (!text.trimStart().startsWith(ZPL_LABEL_START)) throw invalidLabel("zpl");
    return bytes;
  }
  try {
    const labels = readZipEntries(bytes, MAX_LABEL_BYTES)
      .map((entry) => new TextDecoder().decode(entry.data))
      .filter((text) => text.trimStart().startsWith(ZPL_LABEL_START));
    if (labels.length === 0) throw invalidLabel("zpl");
    return new TextEncoder().encode(labels.join("\n"));
  } catch (error) {
    if (error instanceof InvalidZipError) throw invalidLabel("zpl", error);
    throw error;
  }
}

/** One file with the labels of these sale shipments, all of the same store. */
async function fetchLabelFile(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  shipmentIds: readonly string[],
  format: LabelFormat,
): Promise<Uint8Array<ArrayBuffer>> {
  const ids = shipmentIds.map((id) => encodeURIComponent(id)).join(",");
  const response = await fetchWithRetry(
    config.fetchImplementation ?? fetch,
    `https://api.mercadolibre.com/shipment_labels?shipment_ids=${ids}&response_type=${LABEL_RESPONSE_TYPES[format]}`,
    { headers: { authorization: `Bearer ${store.accessToken}` } },
    // A label is a file of up to 10 MB. The 30s deadline is per attempt: a caller signal shared by
    // every attempt fired in the middle of the second one and read as "cancelled".
    { ...config.retry, timeoutMilliseconds: 30_000, maxBodyBytes: MAX_LABEL_BYTES },
  );
  if (!response.ok)
    throw marketplaceError(
      `O Mercado Livre não gerou a etiqueta (erro ${response.status}). Tente de novo em alguns minutos.`,
      {
        status: response.status,
        retryable: response.status >= 500,
      },
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_LABEL_BYTES) throw invalidLabel(format);
  if (format === "zpl") return zplLabel(bytes);
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw invalidLabel(format);
  return bytes;
}

/** A label file as Mercado Livre printed it, in the format asked for. */
export interface MercadoLivreLabelFile {
  format: LabelFormat;
  bytes: Uint8Array<ArrayBuffer>;
}

export async function getMercadoLivreLabel(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
  format: LabelFormat,
): Promise<{ file: MercadoLivreLabelFile; shipmentId: string }> {
  const { shipping } = await loadSaleShipment(config, store, orderId);
  assertLabelPrintable(shipping);
  const bytes = await fetchLabelFile(config, store, [shipping.shipmentId], format);
  return { file: { format, bytes }, shipmentId: shipping.shipmentId };
}

/** An order whose label came, with the marketplace's shipment id its barcode carries. */
export interface PrintedLabel {
  orderId: string;
  shipmentId: string;
}

/** What a batch of labels of one store gave: one file for the printable orders, and the rest. */
export interface MercadoLivreLabelBatch {
  file: MercadoLivreLabelFile | null;
  printed: PrintedLabel[];
  refused: { orderId: string; error: unknown }[];
}

type LabelLookup =
  | { kind: "printable"; orderId: string; shipmentId: string }
  | { kind: "refused"; orderId: string; error: unknown };

/** The sale shipment of one order of a batch, or why its label cannot print. */
async function printableShipment(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
): Promise<LabelLookup> {
  try {
    const { shipping } = await loadSaleShipment(config, store, orderId);
    assertLabelPrintable(shipping);
    return { kind: "printable", orderId, shipmentId: shipping.shipmentId };
  } catch (error) {
    return { kind: "refused", orderId, error };
  }
}

/**
 * The labels of several orders of one store in a single file, as Mercado Livre prints them
 * together. An order whose label cannot print is reported, never fails the others.
 */
export async function getMercadoLivreLabels(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderIds: readonly string[],
  format: LabelFormat,
): Promise<MercadoLivreLabelBatch> {
  if (orderIds.length > MAX_LABELS_PER_REQUEST)
    throw marketplaceError(`Imprima até ${MAX_LABELS_PER_REQUEST} etiquetas por vez`, {
      retryable: false,
    });
  const lookups: LabelLookup[] = [];
  for (let start = 0; start < orderIds.length; start += LABEL_LOOKUP_CONCURRENCY) {
    const chunk = orderIds.slice(start, start + LABEL_LOOKUP_CONCURRENCY);
    lookups.push(
      ...(await Promise.all(chunk.map((orderId) => printableShipment(config, store, orderId)))),
    );
  }
  const printable = lookups.flatMap((lookup) => (lookup.kind === "printable" ? [lookup] : []));
  const refused = lookups.flatMap((lookup) =>
    lookup.kind === "refused" ? [{ orderId: lookup.orderId, error: lookup.error }] : [],
  );
  if (printable.length === 0) {
    return { file: null, printed: [], refused };
  }
  const bytes = await fetchLabelFile(
    config,
    store,
    printable.map((lookup) => lookup.shipmentId),
    format,
  );
  const printed = printable.map(({ orderId, shipmentId }) => ({ orderId, shipmentId }));
  return { file: { format, bytes }, printed, refused };
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
