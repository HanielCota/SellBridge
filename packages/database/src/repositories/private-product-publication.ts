import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { and, count, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { storeConnections, supplierProducts, suppliers } from "../schema/index.ts";

/** Checks private ownership and readiness under the same transaction as the publication. */
export async function assertPrivateProductPublication(
  executor: DatabaseExecutor,
  tenantId: string,
  productId: string,
  storeIds: readonly string[],
) {
  const [source] = await executor
    .select({
      kind: suppliers.catalogKind,
      owner: suppliers.ownerTenantId,
      active: suppliers.active,
      productActive: supplierProducts.active,
      reviewStatus: supplierProducts.reviewStatus,
    })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(eq(supplierProducts.id, productId))
    .for("share", { of: [suppliers, supplierProducts] });
  if (source?.kind !== "seller") return;
  if (source.owner !== tenantId) throw notFoundError("Product not found.");
  if (!source.active || !source.productActive || source.reviewStatus !== "approved") {
    throw conflictError("Make this product ready before publishing it.");
  }
  const [stores] = await executor
    .select({ total: count() })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        eq(storeConnections.status, "connected"),
        inArray(storeConnections.id, [...storeIds]),
      ),
    );
  if (stores?.total !== new Set(storeIds).size) {
    throw notFoundError("One or more destination stores are unavailable.");
  }
}
