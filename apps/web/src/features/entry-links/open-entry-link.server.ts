import {
  claimDeveloperEntryLink,
  getSellableProducts,
  type SellableCatalogProduct,
} from "@sellbridge/database/repositories";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import {
  entryChoiceFreshSince,
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
  | { kind: "invalid" | "expired" | "used" | "team_visit" | "staff_account" | "unavailable" };

/**
 * Claims the choice the browser brought from the link for the signed-in reseller and shows it.
 * "Entrar como cliente" and team accounts never claim: the choice belongs to the person the link
 * was handed to.
 */
export async function openEntryLinkFor(
  context: { userId: string; tenantId: string; role: string; impersonatedBy: string | null },
  choiceSecret: string | undefined,
  now: Date,
): Promise<EntryLinkView> {
  const secret = entryLinkTokenSchema.safeParse(choiceSecret);
  if (!secret.success) {
    return { kind: "invalid" };
  }
  if (context.impersonatedBy !== null) {
    return { kind: "team_visit" };
  }
  if (isStaffRole(context.role)) {
    return { kind: "staff_account" };
  }
  const claim = await claimDeveloperEntryLink(database, {
    choiceHash: hashEntryLinkToken(secret.data),
    userId: context.userId,
    tenantId: context.tenantId,
    now,
    freshSince: entryChoiceFreshSince(now),
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
