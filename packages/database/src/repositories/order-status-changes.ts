import { and, asc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { orderStatusChanges, orders } from "../schema/index.ts";
import { notifyOrderStatus } from "./notification-producers.ts";

type OrderStatus = (typeof orders.$inferSelect)["status"];

export interface OrderStatusChange {
  status: OrderStatus;
  at: Date;
}

/**
 * Records that the order went into this status; `at` defaults to now. A paid or delivered order
 * also notifies the workspace, in the same transaction (item 25).
 */
export async function recordOrderStatusChange(
  database: DatabaseExecutor,
  change: { tenantId: string; orderId: string; status: OrderStatus; at?: Date },
): Promise<void> {
  await database.insert(orderStatusChanges).values({
    tenantId: change.tenantId,
    orderId: change.orderId,
    status: change.status,
    changedAt: change.at,
  });
  const now = new Date();
  await notifyOrderStatus(database, { ...change, at: change.at ?? now, now });
}

/** Each status the order went through, oldest first. */
export async function listOrderStatusChanges(
  database: DatabaseExecutor,
  tenantId: string,
  orderId: string,
): Promise<OrderStatusChange[]> {
  return database
    .select({ status: orderStatusChanges.status, at: orderStatusChanges.changedAt })
    .from(orderStatusChanges)
    .where(and(eq(orderStatusChanges.tenantId, tenantId), eq(orderStatusChanges.orderId, orderId)))
    .orderBy(asc(orderStatusChanges.changedAt));
}
