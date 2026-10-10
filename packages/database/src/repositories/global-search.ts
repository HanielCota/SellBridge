import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listings, orders } from "../schema/index.ts";
import type { TenantRegion } from "./region.ts";
import { containsPattern } from "./sql/search-pattern.ts";
import { listRegionCatalog } from "./suppliers.ts";

const PER_GROUP = 5;

export interface GlobalSearchResults {
  listings: { id: string; title: string; priceCents: number }[];
  orders: { id: string; externalOrderId: string; buyerName: string | null; totalCents: number }[];
  products: { id: string; title: string; supplierName: string; costCents: number }[];
}

/** The command palette's search: the tenant's listings and orders, and the region catalog. */
export async function searchEverything(
  database: Database,
  input: { tenantId: string; region: Pick<TenantRegion, "state" | "city"> | null },
  term: string,
): Promise<GlobalSearchResults> {
  const pattern = containsPattern(term);
  const [listingRows, orderRows, catalog] = await Promise.all([
    database
      .select({ id: listings.id, title: listings.title, priceCents: listings.priceCents })
      .from(listings)
      .where(and(eq(listings.tenantId, input.tenantId), ilike(listings.title, pattern)))
      .orderBy(desc(listings.createdAt))
      .limit(PER_GROUP),
    database
      .select({
        id: orders.id,
        externalOrderId: orders.externalOrderId,
        buyerName: orders.buyerName,
        totalCents: orders.totalCents,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, input.tenantId),
          or(ilike(orders.externalOrderId, pattern), ilike(orders.buyerName, pattern)),
        ),
      )
      .orderBy(desc(orders.orderedAt))
      .limit(PER_GROUP),
    input.region
      ? listRegionCatalog(
          database,
          { region: input.region, tenantId: input.tenantId },
          { search: term, sort: "title" },
          { page: 1, pageSize: PER_GROUP },
        )
      : null,
  ]);
  return {
    listings: listingRows,
    orders: orderRows,
    products: (catalog?.items ?? []).map((product) => ({
      id: product.id,
      title: product.title,
      supplierName: product.supplierName,
      costCents: product.costCents,
    })),
  };
}
