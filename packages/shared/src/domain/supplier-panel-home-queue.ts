import type { FulfillmentStatus } from "../schemas/fulfillment.ts";
import type { RejectionReason } from "./supplier-panel-catalog-status.ts";
import {
  OTHER_REASON_TITLE,
  reviewFieldLabel,
  reviewReasonTitle,
} from "./supplier-product-review.ts";

/**
 * The supplier home's single list ("Início"): what waits for the accept, what is under way to
 * the dispatch, and what to fix in the catalog. Each group shows its first rows and links to the
 * full list; the counting of deadlines stays in `supplier-panel-orders.ts`.
 */

/** Rows each group shows before "Ver todos". */
export const HOME_GROUP_LIMIT = 5;

/** The two order groups: waiting for the accept, and accepted on the way to the dispatch. */
export interface HomeOrderGroups<TRow> {
  accept: TRow[];
  progress: TRow[];
}

/** Splits the queue (already most urgent first) without changing the order inside a group. */
export function splitHomeOrders<TRow extends { status: FulfillmentStatus }>(
  rows: readonly TRow[],
): HomeOrderGroups<TRow> {
  return {
    accept: rows.filter((row) => row.status === "forwarded"),
    progress: rows.filter((row) => row.status !== "forwarded"),
  };
}

/** The SKU whose photo stands for the parcel: its first item's, or null without a SKU. */
export function photoSkuOf(items: readonly { sku: string }[]): string | null {
  const [first] = items;
  if (first === undefined || first.sku === "") {
    return null;
  }
  return first.sku;
}

export type CatalogFixKind = "out_of_stock" | "rejected";

/** A product to fix, as one row of the home list. */
export interface CatalogFix {
  productId: string;
  title: string;
  imageUrl: string | null;
  kind: CatalogFixKind;
  /** Why it needs the supplier, in one short phrase. */
  reason: string;
  /** First review field to focus when opening the rejected product. */
  field: string | null;
}

/** A product of the supplier, with what is left to sell and how many live listings show it. */
export interface SupplierStockRow {
  productId: string;
  title: string;
  sku: string;
  imageUrl: string | null;
  /** Shelf stock minus what paid orders hold; zero or less means nothing left to sell. */
  availableStock: number;
  /** Published listings (every reseller, every store) still showing the product. */
  activeListings: number;
}

/** A product the review refused: it stays out of the catalog until fixed and sent again. */
export interface SupplierRejectedRow {
  productId: string;
  title: string;
  sku: string;
  imageUrl: string | null;
  rejectionReasons: RejectionReason[];
}

function listingsPhrase(count: number): string {
  return count === 1 ? "1 anúncio ativo" : `${count} anúncios ativos`;
}

/** The reason's title, or the field to revise when the rule has no title of its own. */
function reasonTitle(reason: RejectionReason): string {
  const title = reviewReasonTitle(reason.rule);
  if (title !== OTHER_REASON_TITLE) {
    return title;
  }
  // The label's parenthesis ("Código de barras (GTIN)") reads as noise once lowercased.
  const label = reviewFieldLabel(reason.field).replace(/\s*\([^)]*\)$/, "");
  return `Revisar ${label.toLowerCase()}`;
}

/** "Imagem fora do padrão", or "Imagem fora do padrão e mais 2 motivos" for several. */
function rejectionPhrase(reasons: readonly RejectionReason[]): string {
  const [first, ...rest] = reasons;
  if (first === undefined) {
    return "Reprovado na análise";
  }
  const title = reasonTitle(first);
  if (rest.length === 0) {
    return title;
  }
  return `${title} e mais ${rest.length} ${rest.length === 1 ? "motivo" : "motivos"}`;
}

/**
 * Out of stock first (live listings keep selling what the supplier no longer has), then the
 * rejected products, each list in the order the repository read it.
 */
export function catalogFixes(
  stock: readonly SupplierStockRow[],
  rejected: readonly SupplierRejectedRow[],
): CatalogFix[] {
  const outOfStock = stock
    .filter((product) => product.availableStock <= 0 && product.activeListings > 0)
    .map((product) => ({
      productId: product.productId,
      title: product.title,
      imageUrl: product.imageUrl,
      kind: "out_of_stock" as const,
      field: null,
      reason: `Ainda à venda em ${listingsPhrase(product.activeListings)}`,
    }));
  const refused = rejected.map((product) => ({
    productId: product.productId,
    title: product.title,
    imageUrl: product.imageUrl,
    kind: "rejected" as const,
    field: product.rejectionReasons[0]?.field ?? null,
    reason: rejectionPhrase(product.rejectionReasons),
  }));
  return [...outOfStock, ...refused];
}
