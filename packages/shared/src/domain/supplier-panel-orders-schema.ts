import { z } from "zod";
import { MAX_PAGE, searchQuery } from "../schemas/common.ts";
import { optionalParameter, withFallback } from "../schemas/fallback.ts";
import { OPERATION_PERIODS } from "../schemas/fulfillment.ts";
import { isoDateSchema } from "../schemas/period.ts";
import { marketplaceSchema } from "../schemas/stores.ts";
import { SUPPLIER_LABEL_STATES } from "./supplier-order-labels.ts";
import { SUPPLIER_ORDER_TABS } from "./supplier-panel-orders-tabs.ts";

/**
 * The supplier whose parcels are read or moved. Taken as a parameter, never from the request:
 * the access layer (supplier login) resolves it from the session and passes it in.
 */
export const supplierIdSchema = z.uuid({ error: "Fornecedor inválido" });

/** Shipments a batch may move at once: a screenful, so the confirmation lists every one. */
export const MAX_BATCH_SHIPMENTS = 50;

/**
 * The list filters besides the tab: the search (order number, tracking code, buyer, reseller
 * store or SKU), the sale date, the channel, the reseller's store and the label state.
 */
const shipmentFiltersShape = {
  query: searchQuery().default(""),
  period: z.enum(OPERATION_PERIODS).default("all"),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  channel: marketplaceSchema.optional(),
  store: z.uuid().optional(),
  label: z.enum(SUPPLIER_LABEL_STATES).optional(),
};

export const supplierShipmentsSearchSchema = z.object({
  supplierId: supplierIdSchema,
  tab: z.enum(SUPPLIER_ORDER_TABS).default("todo"),
  ...shipmentFiltersShape,
  page: z.number().int().min(1).max(MAX_PAGE).default(1),
});
export type SupplierShipmentsSearch = z.infer<typeof supplierShipmentsSearchSchema>;

export const supplierShipmentCountsSchema = z.object({
  supplierId: supplierIdSchema,
  ...shipmentFiltersShape,
});
export type SupplierShipmentCountsSearch = z.infer<typeof supplierShipmentCountsSchema>;

export const supplierShipmentDetailSchema = z.object({
  supplierId: supplierIdSchema,
  shipmentId: z.uuid({ error: "Pedido inválido" }),
});

export const batchAcceptSchema = z.object({
  supplierId: supplierIdSchema,
  shipmentIds: z
    .array(z.uuid({ error: "Pedido inválido" }))
    .min(1, "Selecione ao menos um pedido")
    .max(MAX_BATCH_SHIPMENTS, `Selecione até ${MAX_BATCH_SHIPMENTS} pedidos por vez`)
    .refine((ids) => new Set(ids).size === ids.length, "Há pedidos repetidos na seleção"),
});
export type BatchAcceptInput = z.infer<typeof batchAcceptSchema>;

/** The parcels whose marketplace labels are printed together, one PDF per reseller store. */
export const batchLabelsSchema = batchAcceptSchema;
export type BatchLabelsInput = z.infer<typeof batchLabelsSchema>;

/** The Pedidos screen's address: tab, filters and page survive a reload or a shared link. */
export const supplierOrdersUrlSearchSchema = z.object({
  tab: withFallback(z.enum(SUPPLIER_ORDER_TABS).default("todo"), "todo"),
  query: optionalParameter(searchQuery()),
  period: withFallback(z.enum(OPERATION_PERIODS).default("all"), "all"),
  from: optionalParameter(isoDateSchema),
  to: optionalParameter(isoDateSchema),
  channel: optionalParameter(marketplaceSchema),
  store: optionalParameter(z.uuid()),
  label: optionalParameter(z.enum(SUPPLIER_LABEL_STATES)),
  page: withFallback(z.coerce.number().int().min(1).max(MAX_PAGE).default(1), 1),
});
export type SupplierOrdersUrlSearch = z.infer<typeof supplierOrdersUrlSearchSchema>;

/**
 * The barcode check: "picking" brings a parcel to "Pronto para envio", "dispatch" sends it with
 * the tracking it already has. The reader types the order number or the tracking code.
 */
export const SUPPLIER_SCAN_MODES = ["picking", "dispatch"] as const;
export type SupplierScanMode = (typeof SUPPLIER_SCAN_MODES)[number];

export const supplierScanSchema = z.object({
  supplierId: supplierIdSchema,
  code: z.string().trim().min(1, "Leia ou digite um código").max(100, "Código longo demais"),
  mode: z.enum(SUPPLIER_SCAN_MODES),
});
export type SupplierScanInput = z.infer<typeof supplierScanSchema>;
