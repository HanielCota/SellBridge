import {
  fitListingTitle,
  listingDescriptionSchema,
  listingTitleSchema,
} from "../schemas/stores.ts";
import { offeredUnits } from "./stock-reservation.ts";

/**
 * Which of the products a reseller picked for a bulk publication go out, and why each other
 * one stays: the same rules as publishing one at a time (title, description, stock), so the
 * batch never takes a shortcut (B16, E8) and its result can name every product left out (E12).
 */

export type BulkPublishSkipReason =
  "already_published" | "out_of_stock" | "invalid_title" | "invalid_description" | "unavailable";

export interface BulkPublishProduct {
  id: string;
  title: string;
  description: string;
  /** Units the reseller can sell: the shelf count minus what paid orders hold. */
  stock: number;
  published: boolean;
}

export interface BulkPublishDraft {
  supplierProductId: string;
  title: string;
  description: string;
}

export interface BulkPublishSkip {
  productId: string;
  title: string | null;
  reason: BulkPublishSkipReason;
}

export interface BulkPublishPlan {
  drafts: BulkPublishDraft[];
  skipped: BulkPublishSkip[];
}

/**
 * Nothing to sell: the units left after paid orders and the safety margin the sync keeps off
 * the marketplaces (STOCK_SAFETY_UNITS) are none.
 */
export function isOutOfStock(stock: number, safetyUnits: number): boolean {
  return offeredUnits(stock, 0, safetyUnits) <= 0;
}

type PlanVerdict =
  { kind: "draft"; draft: BulkPublishDraft } | { kind: "skip"; reason: BulkPublishSkipReason };

function verdictFor(product: BulkPublishProduct, safetyUnits: number): PlanVerdict {
  if (product.published) {
    return { kind: "skip", reason: "already_published" };
  }
  if (isOutOfStock(product.stock, safetyUnits)) {
    return { kind: "skip", reason: "out_of_stock" };
  }
  const title = listingTitleSchema.safeParse(fitListingTitle(product.title));
  if (!title.success) {
    return { kind: "skip", reason: "invalid_title" };
  }
  const description = listingDescriptionSchema.safeParse(product.description);
  if (!description.success) {
    return { kind: "skip", reason: "invalid_description" };
  }
  return {
    kind: "draft",
    draft: { supplierProductId: product.id, title: title.data, description: description.data },
  };
}

/** Each picked product once, in the order picked: a draft, or the reason it stays out. */
export function planBulkPublish(input: {
  requestedIds: readonly string[];
  products: readonly BulkPublishProduct[];
  safetyUnits: number;
}): BulkPublishPlan {
  const byId = new Map(input.products.map((product) => [product.id, product]));
  return [...new Set(input.requestedIds)].reduce<BulkPublishPlan>(
    (plan, productId) => {
      const product = byId.get(productId);
      if (product === undefined) {
        return {
          ...plan,
          skipped: [...plan.skipped, { productId, title: null, reason: "unavailable" }],
        };
      }
      const verdict = verdictFor(product, input.safetyUnits);
      if (verdict.kind === "draft") {
        return { ...plan, drafts: [...plan.drafts, verdict.draft] };
      }
      const skip = { productId, title: product.title, reason: verdict.reason };
      return { ...plan, skipped: [...plan.skipped, skip] };
    },
    { drafts: [], skipped: [] },
  );
}
