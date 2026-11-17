import {
  advanceSupplierTestOrder,
  createSupplierTestOrder,
  deleteSupplierTestOrder,
  getSupplierTestOrder,
  type SupplierTestOrderStep,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";

/*
 * The supplier's simulated order. Every call is scoped to the `supplierId` the panel middleware
 * checked against the session, and none of them touches orders, parcels, payments or a
 * marketplace: the test order only exists in its own table.
 */

export async function loadTestOrder(supplierId: string) {
  return await getSupplierTestOrder(database, supplierId);
}

export async function startTestOrder(supplierId: string) {
  const created = await createSupplierTestOrder(database, { supplierId, now: new Date() });
  logger.info("supplier_panel.test_order_created", { supplierId, testOrderId: created.id });
  return created;
}

export async function advanceTestOrder(input: {
  supplierId: string;
  testOrderId: string;
  from: SupplierTestOrderStep;
}) {
  const updated = await advanceSupplierTestOrder(database, { ...input, now: new Date() });
  logger.info("supplier_panel.test_order_advanced", {
    supplierId: input.supplierId,
    testOrderId: input.testOrderId,
    step: updated.step,
  });
  return updated;
}

export async function removeTestOrder(input: { supplierId: string; testOrderId: string }) {
  await deleteSupplierTestOrder(database, input);
  logger.info("supplier_panel.test_order_deleted", input);
  return { ok: true };
}
