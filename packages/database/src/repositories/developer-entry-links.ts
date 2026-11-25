import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Database } from "../client.ts";
import { developerEntryLinks, supplierProducts, suppliers } from "../schema/index.ts";
import {
  productOfferedInCatalog,
  publicSupplier,
  supplierOpenToResellers,
} from "./sql/sellable.ts";

/**
 * The chosen products a reseller may really pick: offered in the catalog by a public supplier
 * open to resellers. Returns the ids that qualify; the caller compares them with what was asked.
 */
export async function findOfferedSupplierProductIds(
  database: Database,
  supplierId: string,
  productIds: readonly string[],
): Promise<string[]> {
  if (productIds.length === 0) {
    return [];
  }
  const rows = await database
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        inArray(supplierProducts.id, [...productIds]),
        publicSupplier(),
        supplierOpenToResellers(),
        productOfferedInCatalog(),
      ),
    );
  return rows.map((row) => row.id);
}

export async function createDeveloperEntryLink(
  database: Database,
  link: {
    tokenHash: string;
    keyId: string;
    supplierId: string;
    productIds: readonly string[];
    expiresAt: Date;
  },
): Promise<{ id: string }> {
  const [row] = await database
    .insert(developerEntryLinks)
    .values({ ...link, productIds: [...link.productIds] })
    .returning({ id: developerEntryLinks.id });
  if (row === undefined) {
    throw new Error("developer entry link insert returned no row");
  }
  return row;
}

/** What a claimed link carries into the app: never the token. */
export interface ClaimedEntryLink {
  id: string;
  supplierId: string;
  productIds: string[];
}

export type EntryLinkClaim =
  | { kind: "claimed"; link: ClaimedEntryLink }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "used" };

const claimedColumns = {
  id: developerEntryLinks.id,
  supplierId: developerEntryLinks.supplierId,
  productIds: developerEntryLinks.productIds,
};

/**
 * Claims the link for the signed-in account, once. Opening it again from the same account and
 * profile shows the same choice (a reload); any other account, or an expired link, is refused.
 */
export async function claimDeveloperEntryLink(
  database: Database,
  claim: { tokenHash: string; userId: string; tenantId: string; now: Date },
): Promise<EntryLinkClaim> {
  const [claimed] = await database
    .update(developerEntryLinks)
    .set({ claimedAt: claim.now, claimedByUserId: claim.userId, claimedTenantId: claim.tenantId })
    .where(
      and(
        eq(developerEntryLinks.tokenHash, claim.tokenHash),
        isNull(developerEntryLinks.claimedAt),
        gt(developerEntryLinks.expiresAt, claim.now),
      ),
    )
    .returning(claimedColumns);
  if (claimed !== undefined) {
    return { kind: "claimed", link: claimed };
  }
  const [existing] = await database
    .select({
      ...claimedColumns,
      claimedAt: developerEntryLinks.claimedAt,
      claimedByUserId: developerEntryLinks.claimedByUserId,
      claimedTenantId: developerEntryLinks.claimedTenantId,
    })
    .from(developerEntryLinks)
    .where(eq(developerEntryLinks.tokenHash, claim.tokenHash))
    .limit(1);
  if (existing === undefined) {
    return { kind: "not_found" };
  }
  if (existing.claimedAt === null) {
    return { kind: "expired" };
  }
  const sameClaimer =
    existing.claimedByUserId === claim.userId && existing.claimedTenantId === claim.tenantId;
  if (sameClaimer) {
    return {
      kind: "claimed",
      link: { id: existing.id, supplierId: existing.supplierId, productIds: existing.productIds },
    };
  }
  return { kind: "used" };
}
