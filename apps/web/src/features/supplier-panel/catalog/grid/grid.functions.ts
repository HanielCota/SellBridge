import {
  catalogModelRefSchema,
  catalogSaveModelDraftSchema,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { blockedContactLogging } from "@/lib/server/blocked-contact-logging";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { assertSupplierAcceptsProducts } from "../supplier-active-guard";
import {
  loadPanelModelForm,
  writePanelModelDeletion,
  writePanelModelDraft,
  writePanelModelPublication,
} from "./grid.server";

export const supplierPanelGetModelForm = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(z.object({ supplierId: z.uuid(), modelId: z.uuid().optional() }))
  .handler(async ({ data }) => await loadPanelModelForm(data));

export const supplierPanelSaveModelDraft = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware, blockedContactLogging("supplier_panel")])
  .validator(catalogSaveModelDraftSchema)
  .handler(async ({ data }) => {
    await assertSupplierAcceptsProducts(data.supplierId);
    return await writePanelModelDraft(data);
  });

export const supplierPanelPublishModel = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(catalogModelRefSchema)
  .handler(async ({ data }) => {
    await assertSupplierAcceptsProducts(data.supplierId);
    return await writePanelModelPublication(data);
  });

/** Deleting stays open to a switched-off supplier: it only removes what nobody sold. */
export const supplierPanelDeleteModel = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(catalogModelRefSchema)
  .handler(async ({ data }) => await writePanelModelDeletion(data));
