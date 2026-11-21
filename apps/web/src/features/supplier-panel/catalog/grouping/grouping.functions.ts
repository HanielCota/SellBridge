import { groupProductsSchema } from "@sellbridge/shared/product-grouping";
import { catalogModelRefSchema } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { assertSupplierAcceptsProducts } from "../supplier-active-guard";
import {
  loadPanelGroupingSuggestions,
  writePanelGrouping,
  writePanelSeparation,
} from "./grouping.server";

export const supplierPanelGetGroupingSuggestions = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(z.object({ supplierId: z.uuid() }))
  .handler(async ({ data }) => await loadPanelGroupingSuggestions(data));

export const supplierPanelGroupProducts = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(groupProductsSchema)
  .handler(async ({ data, context }) => {
    await assertSupplierAcceptsProducts(data.supplierId);
    return await writePanelGrouping(data, actingUser(context));
  });

/** Separating stays open to a switched-off supplier: it only gives products their "before" back. */
export const supplierPanelSeparateModel = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(catalogModelRefSchema)
  .handler(async ({ data, context }) => await writePanelSeparation(data, actingUser(context)));

/** The trail names who acted: the team member when acting as the supplier, else the supplier. */
function actingUser(context: { userId: string; impersonatedBy: string | null }): string {
  return context.impersonatedBy ?? context.userId;
}
