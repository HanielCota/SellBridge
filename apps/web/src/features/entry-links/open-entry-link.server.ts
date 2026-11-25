import {
  claimDeveloperEntryLink,
  getSellableProducts,
  type SellableCatalogProduct,
} from "@sellbridge/database/repositories";
import {
  entryLinkTokenSchema,
  hashEntryLinkToken,
} from "@/features/developer-api/entry-link-token.server";
import { database } from "@/lib/server/database";

/** What the person sees after opening an entry link. */
export type EntryLinkView =
  | {
      kind: "ready";
      supplierId: string;
      supplierName: string;
      products: Pick<SellableCatalogProduct, "id" | "title" | "imageUrl" | "costCents">[];
      /** Chosen in the other project but no longer offered (switched off since). */
      unavailableCount: number;
    }
  | { kind: "invalid" | "expired" | "used" | "team_visit" | "unavailable" };

/**
 * Claims the link for the signed-in reseller and shows the choice. "Entrar como cliente" never
 * claims: the link belongs to the person it was handed to.
 */
export async function openEntryLinkFor(
  context: { userId: string; tenantId: string; impersonatedBy: string | null },
  data: { token: string },
  now: Date,
): Promise<EntryLinkView> {
  const token = entryLinkTokenSchema.safeParse(data.token);
  if (!token.success) {
    return { kind: "invalid" };
  }
  if (context.impersonatedBy !== null) {
    return { kind: "team_visit" };
  }
  const claim = await claimDeveloperEntryLink(database, {
    tokenHash: hashEntryLinkToken(token.data),
    userId: context.userId,
    tenantId: context.tenantId,
    now,
  });
  if (claim.kind === "not_found") {
    return { kind: "invalid" };
  }
  if (claim.kind !== "claimed") {
    return { kind: claim.kind };
  }
  const products = await getSellableProducts(database, context.tenantId, claim.link.productIds);
  const offered = products.filter((product) => product.supplierId === claim.link.supplierId);
  const supplierName = offered[0]?.supplierName ?? null;
  if (supplierName === null) {
    return { kind: "unavailable" };
  }
  return {
    kind: "ready",
    supplierId: claim.link.supplierId,
    supplierName,
    products: offered.map((product) => ({
      id: product.id,
      title: product.title,
      imageUrl: product.imageUrl,
      costCents: product.costCents,
    })),
    unavailableCount: claim.link.productIds.length - offered.length,
  };
}
