import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { listings, listingTargets } from "../schema/index.ts";

/** Durable stop requests outlive product restoration and any remote call already in flight. */
export async function stopProductPublications(
  executor: DatabaseExecutor,
  tenantId: string,
  productId: string,
) {
  const productListings = executor
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.tenantId, tenantId), eq(listings.supplierProductId, productId)));
  const scope = and(
    eq(listingTargets.tenantId, tenantId),
    inArray(listingTargets.listingId, productListings),
  );
  await executor.update(listingTargets).set({ pauseRequested: true }).where(scope);
  await executor
    .update(listingTargets)
    .set({
      status: "error",
      errorReason: "Product archived. Restore it and retry this publication when ready.",
    })
    .where(and(scope, eq(listingTargets.status, "pending")));
  const paused = await executor
    .update(listingTargets)
    .set({ status: "paused" })
    .where(and(scope, eq(listingTargets.status, "published")))
    .returning({ id: listingTargets.id });
  return paused.length;
}
