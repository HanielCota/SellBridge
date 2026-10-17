import { z } from "zod";
import { MAX_PAGE, searchQuery } from "../schemas/common.ts";
import { optionalParameter, withFallback } from "../schemas/fallback.ts";
import { SUPPLIER_ORDER_TABS } from "./supplier-panel-orders-tabs.ts";

/**
 * The supplier whose parcels are read or moved. Taken as a parameter, never from the request:
 * the access layer (supplier login) resolves it from the session and passes it in.
 */
export const supplierIdSchema = z.uuid({ error: "Fornecedor inválido" });

/** Shipments a batch may move at once: a screenful, so the confirmation lists every one. */
export const MAX_BATCH_SHIPMENTS = 50;

export const supplierShipmentsSearchSchema = z.object({
  supplierId: supplierIdSchema,
  tab: z.enum(SUPPLIER_ORDER_TABS).default("todo"),
  /** Order number or SKU, matched anywhere in the text. */
  query: searchQuery().default(""),
  page: z.number().int().min(1).max(MAX_PAGE).default(1),
});
export type SupplierShipmentsSearch = z.infer<typeof supplierShipmentsSearchSchema>;

export const supplierShipmentCountsSchema = z.object({
  supplierId: supplierIdSchema,
  query: searchQuery().default(""),
});

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

/** The Pedidos screen's address: tab, search and page survive a reload or a shared link. */
export const supplierOrdersUrlSearchSchema = z.object({
  tab: withFallback(z.enum(SUPPLIER_ORDER_TABS).default("todo"), "todo"),
  query: optionalParameter(searchQuery()),
  page: withFallback(z.coerce.number().int().min(1).max(MAX_PAGE).default(1), 1),
});
export type SupplierOrdersUrlSearch = z.infer<typeof supplierOrdersUrlSearchSchema>;
