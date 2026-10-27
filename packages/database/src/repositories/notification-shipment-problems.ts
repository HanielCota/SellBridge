import { shipmentProblemContent } from "@sellbridge/shared/notification-events";
import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { suppliers } from "../schema/index.ts";
import { notifyWorkspace } from "./notification-producers.ts";

/**
 * The carrier could not deliver a parcel, or it came back: the reseller (who answers the buyer)
 * and the supplier (who gets it back) both hear it. Keyed by parcel and problem, so a reading
 * seen twice never queues it twice. Runs inside the caller's transaction.
 */
export async function queueShipmentProblemNotices(
  database: DatabaseExecutor,
  input: {
    shipmentId: string;
    tenantId: string;
    supplierId: string;
    orderId: string;
    externalOrderId: string;
    problem: "not_delivered" | "returned";
  },
): Promise<void> {
  const dedupeKey = `shipment:${input.shipmentId}:problem:${input.problem}`;
  const notice = {
    orderId: input.orderId,
    externalOrderId: input.externalOrderId,
    problem: input.problem,
  };
  await notifyWorkspace(database, {
    tenantId: input.tenantId,
    event: "shipment_problem",
    dedupeKey,
    content: shipmentProblemContent({ ...notice, recipient: "reseller" }),
  });
  const [supplier] = await database
    .select({ organizationId: suppliers.organizationId, catalogKind: suppliers.catalogKind })
    .from(suppliers)
    .where(eq(suppliers.id, input.supplierId));
  // The reseller's own stock has no supplier to tell.
  if (
    supplier === undefined ||
    supplier.organizationId === null ||
    supplier.catalogKind !== "supplier"
  ) {
    return;
  }
  await notifyWorkspace(database, {
    tenantId: supplier.organizationId,
    event: "shipment_problem",
    dedupeKey,
    content: shipmentProblemContent({ ...notice, recipient: "supplier" }),
  });
}
