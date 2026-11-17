import { supplierIdSchema } from "@sellbridge/shared/supplier-panel-orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import {
  advanceTestOrder,
  loadTestOrder,
  removeTestOrder,
  startTestOrder,
} from "./test-order.server";
import { TEST_ORDER_STEPS } from "./test-order-steps";

const supplierInput = z.object({ supplierId: supplierIdSchema });
const testOrderInput = supplierInput.extend({
  testOrderId: z.uuid({ error: "Pedido de teste inválido" }),
});

export const getSupplierTestOrderFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierInput)
  .handler(async ({ data }) => await loadTestOrder(data.supplierId));

export const createSupplierTestOrderFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierInput)
  .handler(async ({ data }) => await startTestOrder(data.supplierId));

export const advanceSupplierTestOrderFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(testOrderInput.extend({ from: z.enum(TEST_ORDER_STEPS) }))
  .handler(async ({ data }) => await advanceTestOrder(data));

export const deleteSupplierTestOrderFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(testOrderInput)
  .handler(async ({ data }) => await removeTestOrder(data));
