import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  developerApiKeys,
  developerEntryLinks,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import {
  productOfferedInCatalog,
  publicSupplier,
  supplierOpenToResellers,
  supplierReceivingRuleMet,
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
        supplierReceivingRuleMet(),
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

/** The key that made a link, for the usage trail of the click. */
export interface EntryLinkIssuer {
  linkId: string;
  keyId: string;
  keyPrefix: string;
}

export type EntryLinkConsumption =
  | { kind: "consumed"; issuer: EntryLinkIssuer }
  | { kind: "expired" | "used"; issuer: EntryLinkIssuer }
  | { kind: "not_found" };

export type EntryLinkState = "open" | "expired" | "used" | "not_found";

/**
 * Reads whether a link can still be confirmed, without spending it: link previews load the page
 * too, so only the confirmation itself may change the link.
 */
export async function findDeveloperEntryLinkState(
  database: Database,
  lookup: { tokenHash: string; now: Date },
): Promise<EntryLinkState> {
  const [found] = await database
    .select({
      consumedAt: developerEntryLinks.consumedAt,
      expiresAt: developerEntryLinks.expiresAt,
    })
    .from(developerEntryLinks)
    .where(eq(developerEntryLinks.tokenHash, lookup.tokenHash))
    .limit(1);
  if (found === undefined) {
    return "not_found";
  }
  if (found.consumedAt !== null) {
    return "used";
  }
  return found.expiresAt > lookup.now ? "open" : "expired";
}

/**
 * Spends the token on confirmation, signed in or not, and binds the choice to the secret the
 * browser keeps. A second click, or one after expiry, gets nothing.
 */
export async function consumeDeveloperEntryLink(
  database: Database,
  consumption: { tokenHash: string; choiceHash: string; now: Date },
): Promise<EntryLinkConsumption> {
  const [consumed] = await database
    .update(developerEntryLinks)
    .set({ consumedAt: consumption.now, choiceHash: consumption.choiceHash })
    .where(
      and(
        eq(developerEntryLinks.tokenHash, consumption.tokenHash),
        isNull(developerEntryLinks.consumedAt),
        gt(developerEntryLinks.expiresAt, consumption.now),
      ),
    )
    .returning({ id: developerEntryLinks.id });
  const [found] = await database
    .select({
      linkId: developerEntryLinks.id,
      keyId: developerEntryLinks.keyId,
      keyPrefix: developerApiKeys.prefix,
      consumedAt: developerEntryLinks.consumedAt,
    })
    .from(developerEntryLinks)
    .innerJoin(developerApiKeys, eq(developerApiKeys.id, developerEntryLinks.keyId))
    .where(eq(developerEntryLinks.tokenHash, consumption.tokenHash))
    .limit(1);
  if (found === undefined) {
    return { kind: "not_found" };
  }
  const issuer = { linkId: found.linkId, keyId: found.keyId, keyPrefix: found.keyPrefix };
  if (consumed !== undefined) {
    return { kind: "consumed", issuer };
  }
  return { kind: found.consumedAt === null ? "expired" : "used", issuer };
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
 * Claims the choice behind a browser's secret for the signed-in account, once, while the choice
 * is fresh (consumed after `freshSince`). The same account and profile see it again on a reload;
 * any other account is refused.
 */
export async function claimDeveloperEntryLink(
  database: Database,
  claim: { choiceHash: string; userId: string; tenantId: string; now: Date; freshSince: Date },
): Promise<EntryLinkClaim> {
  const [claimed] = await database
    .update(developerEntryLinks)
    .set({ claimedAt: claim.now, claimedByUserId: claim.userId, claimedTenantId: claim.tenantId })
    .where(
      and(
        eq(developerEntryLinks.choiceHash, claim.choiceHash),
        isNull(developerEntryLinks.claimedAt),
        gt(developerEntryLinks.consumedAt, claim.freshSince),
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
    .where(eq(developerEntryLinks.choiceHash, claim.choiceHash))
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
