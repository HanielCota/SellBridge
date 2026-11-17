import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  SUPPLIER_TEST_ORDER_STEPS,
  supplierProducts,
  suppliers,
  supplierTestOrders,
  type SupplierTestOrderStep,
} from "../schema/index.ts";

const HOUR_IN_MILLISECONDS = 3_600_000;
/** Shown when the supplier has no product yet: the flow is the same with a sample item. */
const SAMPLE_PRODUCT = { title: "Produto de exemplo", sku: "EXEMPLO" } as const;

export type SupplierTestOrder = typeof supplierTestOrders.$inferSelect;

/** The timestamp column each step fills when the supplier reaches it. */
const STEP_COLUMNS = {
  accepted: "acceptedAt",
  label_printed: "labelPrintedAt",
  picked: "pickedAt",
  shipped: "shippedAt",
  delivered: "deliveredAt",
} as const satisfies Record<Exclude<SupplierTestOrderStep, "received">, keyof SupplierTestOrder>;

/** The step after `step`, or null once the test order was delivered. */
export function nextSupplierTestOrderStep(
  step: SupplierTestOrderStep,
): Exclude<SupplierTestOrderStep, "received"> | null {
  const next = SUPPLIER_TEST_ORDER_STEPS[SUPPLIER_TEST_ORDER_STEPS.indexOf(step) + 1];
  if (next === undefined || next === "received") {
    return null;
  }
  return next;
}

/** The supplier's test order, or null when it has none. */
export async function getSupplierTestOrder(
  database: Database,
  supplierId: string,
): Promise<SupplierTestOrder | null> {
  const [row] = await database
    .select()
    .from(supplierTestOrders)
    .where(eq(supplierTestOrders.supplierId, supplierId))
    .limit(1);
  return row ?? null;
}

async function newestProduct(database: Database, supplierId: string) {
  const [product] = await database
    .select({ id: supplierProducts.id, title: supplierProducts.title, sku: supplierProducts.sku })
    .from(supplierProducts)
    .where(and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.active, true)))
    .orderBy(desc(supplierProducts.createdAt))
    .limit(1);
  return product ?? null;
}

async function dispatchHours(database: Database, supplierId: string): Promise<number> {
  const [supplier] = await database
    .select({ hours: suppliers.dispatchWithinHours })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (supplier === undefined) {
    throw notFoundError("Fornecedor não encontrado");
  }
  return supplier.hours;
}

/**
 * Creates the supplier's test order with its newest product (a sample item when it has none),
 * due for posting within the supplier's own dispatch window. Nothing outside this table changes.
 *
 * @throws {AppError} conflict when the supplier already has a test order.
 */
export async function createSupplierTestOrder(
  database: Database,
  input: { supplierId: string; now: Date },
): Promise<SupplierTestOrder> {
  const [hours, product] = await Promise.all([
    dispatchHours(database, input.supplierId),
    newestProduct(database, input.supplierId),
  ]);
  const [created] = await database
    .insert(supplierTestOrders)
    .values({
      supplierId: input.supplierId,
      supplierProductId: product?.id ?? null,
      productTitle: product?.title ?? SAMPLE_PRODUCT.title,
      productSku: product?.sku ?? SAMPLE_PRODUCT.sku,
      dispatchDeadlineAt: new Date(input.now.getTime() + hours * HOUR_IN_MILLISECONDS),
      createdAt: input.now,
    })
    .onConflictDoNothing({ target: supplierTestOrders.supplierId })
    .returning();
  if (created === undefined) {
    throw conflictError("Você já tem um pedido de teste. Apague o atual para criar outro.");
  }
  return created;
}

/**
 * Moves the supplier's test order to its next step and dates it. Only from the step the screen
 * showed, so a double click advances once.
 *
 * @throws {AppError} not found for another supplier's test order; conflict once delivered or when
 * the step already moved.
 */
export async function advanceSupplierTestOrder(
  database: Database,
  input: { supplierId: string; testOrderId: string; from: SupplierTestOrderStep; now: Date },
): Promise<SupplierTestOrder> {
  const next = nextSupplierTestOrderStep(input.from);
  if (next === null) {
    throw conflictError("Este pedido de teste já foi entregue.");
  }
  const [updated] = await database
    .update(supplierTestOrders)
    .set({ step: next, [STEP_COLUMNS[next]]: input.now })
    .where(
      and(
        eq(supplierTestOrders.id, input.testOrderId),
        eq(supplierTestOrders.supplierId, input.supplierId),
        eq(supplierTestOrders.step, input.from),
      ),
    )
    .returning();
  if (updated !== undefined) {
    return updated;
  }
  const current = await getSupplierTestOrder(database, input.supplierId);
  if (current === null || current.id !== input.testOrderId) {
    throw notFoundError("Pedido de teste não encontrado");
  }
  throw conflictError("Este pedido de teste já avançou. Atualize a página.");
}

/**
 * Deletes the supplier's test order.
 *
 * @throws {AppError} not found when it is not this supplier's (or was already deleted).
 */
export async function deleteSupplierTestOrder(
  database: Database,
  input: { supplierId: string; testOrderId: string },
): Promise<void> {
  const deleted = await database
    .delete(supplierTestOrders)
    .where(
      and(
        eq(supplierTestOrders.id, input.testOrderId),
        eq(supplierTestOrders.supplierId, input.supplierId),
      ),
    )
    .returning({ id: supplierTestOrders.id });
  if (deleted.length === 0) {
    throw notFoundError("Pedido de teste não encontrado");
  }
}
