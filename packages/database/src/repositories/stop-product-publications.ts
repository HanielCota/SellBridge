import type { ListingPauseReason } from "@sellbridge/shared/listing-pause-reasons";
import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { listings, listingTargets } from "../schema/index.ts";

const ARCHIVED: ListingPauseReason = "product_archived";

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
  // In-flight publications land paused with the reason too (markTargetPublished keeps it).
  await executor
    .update(listingTargets)
    .set({ pauseRequested: true, pauseReason: ARCHIVED })
    .where(scope);
  await executor
    .update(listingTargets)
    .set({
      status: "error",
      errorReason:
        "Produto arquivado. Restaure-o e tente publicar novamente quando estiver pronto.",
    })
    .where(and(scope, eq(listingTargets.status, "pending")));
  const paused = await executor
    .update(listingTargets)
    .set({ status: "paused", pauseReason: ARCHIVED })
    .where(and(scope, eq(listingTargets.status, "published")))
    .returning({ id: listingTargets.id });
  return paused.length;
}
