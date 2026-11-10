import {
  evaluateCompleteness,
  isProhibitedProduct,
  requiredAttributesFor,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { readProductFiscal, type ProductFiscalPatch } from "@sellbridge/shared/product-fiscal";
import type { EditableProductFields } from "@sellbridge/shared/supplier-panel-catalog-status";
import { supplierImportStatus } from "@sellbridge/shared/supplier-panel-import-status";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { categories, supplierProducts } from "../schema/index.ts";

/** An import row as the admin import plans it: attributes may be absent (blank cells). */
type ImportedRow = Omit<EditableProductFields, "mercadoLivreAttributes" | "fiscal"> & {
  readonly mercadoLivreAttributes?: Readonly<Record<string, string>> | undefined;
  /** Only the fiscal cells the line filled (merged into what is stored, as the upsert does). */
  readonly fiscal?: ProductFiscalPatch | undefined;
};

/**
 * The supplier's import rows with the review status each one lands in, plus what the upsert's
 * conflict clause must also overwrite; nothing without a `reviewAt`. Runs inside
 * the import transaction, after its locks.
 */
export async function reviewedImportValues<TProduct extends ImportedRow>(
  transaction: DatabaseExecutor,
  input: { supplierId: string; reviewAt?: Date | undefined },
  products: readonly TProduct[],
) {
  const now = input.reviewAt;
  if (now === undefined) {
    return undefined;
  }
  const skus = products.map((product) => product.sku);
  const previousRows =
    skus.length === 0
      ? []
      : await transaction
          .select()
          .from(supplierProducts)
          .where(
            and(
              eq(supplierProducts.supplierId, input.supplierId),
              inArray(supplierProducts.sku, skus),
            ),
          );
  const previousBySku = new Map(previousRows.map((row) => [row.sku, row]));
  const slugById = new Map(
    (await transaction.select({ id: categories.id, slug: categories.slug }).from(categories)).map(
      (category) => [category.id, category.slug],
    ),
  );
  const values = products.map((product) => {
    const previous = previousBySku.get(product.sku);
    // The upsert merges attributes (blank cells keep the product's own), so judge the merge.
    const next = {
      ...product,
      mercadoLivreAttributes: {
        ...previous?.mercadoLivreAttributes,
        ...product.mercadoLivreAttributes,
      },
      fiscal: readProductFiscal({ ...previous?.fiscal, ...product.fiscal }),
      // A product the import creates needs NF-e data to go on sale; old ones keep their flag.
      fiscalRequired: previous?.fiscalRequired ?? true,
    };
    const slug = product.categoryId === null ? null : slugById.get(product.categoryId);
    const blocking = evaluateCompleteness(next, requiredAttributesFor(slug)).blocking.length;
    return {
      ...product,
      ...supplierImportStatus({
        previous,
        next,
        blockingIssueCount: blocking,
        prohibited: isProhibitedProduct(next),
        now,
      }),
    };
  });
  return {
    values,
    conflictSet: {
      reviewStatus: sql`excluded.review_status`,
      submittedAt: sql`excluded.submitted_at`,
    },
  };
}
