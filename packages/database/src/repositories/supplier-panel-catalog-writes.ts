import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import type {
  CatalogDraftValues,
  CatalogProductRef,
  CatalogSaveDraftInput,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import {
  evaluateCompleteness,
  requiredAttributesFor,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import {
  changedProductFields,
  reviewTransition,
  statusAfterEdit,
  submitTransition,
  type RejectionReason,
} from "@sellbridge/shared/supplier-panel-catalog-status";
import { firstTextWithContact, SUPPLIER_TEXT_CONTACT_REFUSED } from "@sellbridge/shared/schemas";
import { and, eq, ne } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { categories, supplierProducts, suppliers } from "../schema/index.ts";
import {
  getSupplierPanelProduct,
  type SupplierPanelProduct,
  type SupplierPanelProductRow,
} from "./supplier-panel-catalog.ts";

const STOCK_MOVED_MESSAGE =
  "O estoque mudou depois que você abriu o produto, recarregue para conferir.";

/** Serializes the supplier's catalog writes (same lock the admin form and CSV import take). */
async function lockSupplier(transaction: DatabaseExecutor, supplierId: string) {
  const [supplier] = await transaction
    .select({ id: suppliers.id, catalogKind: suppliers.catalogKind })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .for("update");
  if (supplier === undefined) {
    throw notFoundError(`Fornecedor ${supplierId} não encontrado`);
  }
  return supplier;
}

async function lockProduct(
  transaction: DatabaseExecutor,
  ref: CatalogProductRef,
): Promise<SupplierPanelProductRow | undefined> {
  const [product] = await transaction
    .select()
    .from(supplierProducts)
    .where(
      and(eq(supplierProducts.id, ref.productId), eq(supplierProducts.supplierId, ref.supplierId)),
    )
    .for("update");
  return product;
}

async function lockExistingProduct(
  transaction: DatabaseExecutor,
  ref: CatalogProductRef,
): Promise<SupplierPanelProductRow> {
  const product = await lockProduct(transaction, ref);
  if (product === undefined) {
    throw notFoundError(`Produto ${ref.productId} não encontrado neste fornecedor`);
  }
  return product;
}

/**
 * Every reseller reads a product once it is approved, so its texts must carry no contact. The
 * form refuses them already; this catches texts saved before the rule or past the form.
 */
function assertTextsWithoutContact(product: SupplierPanelProductRow): void {
  const field = firstTextWithContact({
    title: product.title,
    description: product.description,
    ...product.mercadoLivreAttributes,
  });
  if (field !== null) {
    throw validationError(`${SUPPLIER_TEXT_CONTACT_REFUSED} Corrija o campo "${field}".`);
  }
}

async function categorySlugOf(
  transaction: DatabaseExecutor,
  categoryId: string | null,
): Promise<string | null> {
  if (categoryId === null) {
    return null;
  }
  const [category] = await transaction
    .select({ slug: categories.slug })
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (category === undefined) {
    throw validationError(`Categoria ${categoryId} não encontrada; escolha uma da lista`);
  }
  return category.slug;
}

async function assertUniqueSku(transaction: DatabaseExecutor, input: CatalogSaveDraftInput) {
  const [duplicate] = await transaction
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierId, input.supplierId),
        eq(supplierProducts.sku, input.values.sku),
        ne(supplierProducts.id, input.productId),
      ),
    );
  if (duplicate !== undefined) {
    throw conflictError(`Já existe um produto com o SKU "${input.values.sku}" neste fornecedor`);
  }
}

function blockingCount(values: CatalogDraftValues, categorySlug: string | null): number {
  return evaluateCompleteness(
    { ...values, mercadoLivreAttributes: values.mercadoLivreAttributes ?? {} },
    requiredAttributesFor(categorySlug),
  ).blocking.length;
}

/**
 * The values to write: an untouched shelf count is not written back (sales may have moved it),
 * and a changed one only lands while the shelf still holds what the form showed.
 */
function valuesToWrite(stored: SupplierPanelProductRow, input: CatalogSaveDraftInput) {
  const values = {
    ...input.values,
    mercadoLivreAttributes: input.values.mercadoLivreAttributes ?? stored.mercadoLivreAttributes,
  };
  if (input.expectedStock === undefined || values.stock === input.expectedStock) {
    return { ...values, stock: input.expectedStock === undefined ? values.stock : stored.stock };
  }
  if (stored.stock !== input.expectedStock) {
    throw conflictError(STOCK_MOVED_MESSAGE);
  }
  return values;
}

/**
 * Refuses an edit made over a version the form never saw. A retried autosave finds its own
 * values already stored (nothing changed), which is the same answer, not a conflict.
 */
function assertFreshVersion(
  stored: SupplierPanelProductRow,
  input: CatalogSaveDraftInput,
  changed: readonly string[],
): void {
  const sameVersion =
    input.expectedUpdatedAt !== undefined &&
    Date.parse(input.expectedUpdatedAt) === stored.updatedAt.getTime();
  if (sameVersion || changed.length === 0) {
    return;
  }
  throw conflictError(
    `Este produto mudou em outra janela (versão do formulário: ${input.expectedUpdatedAt ?? "nenhuma"}, versão salva: ${stored.updatedAt.toISOString()}), recarregue para continuar.`,
  );
}

async function updateDraft(
  transaction: DatabaseExecutor,
  stored: SupplierPanelProductRow,
  input: CatalogSaveDraftInput,
  options: { now: Date; reviewRequired: boolean },
): Promise<void> {
  const { now, reviewRequired } = options;
  const values = valuesToWrite(stored, input);
  const changed = changedProductFields(stored, values);
  assertFreshVersion(stored, input, changed);
  if (changed.length === 0) {
    return;
  }
  const categorySlug = await categorySlugOf(transaction, values.categoryId);
  const reviewedNext = statusAfterEdit({
    current: stored.reviewStatus,
    changedFields: changed,
    blockingIssueCount: blockingCount(values, categorySlug),
  });
  const contentReady = evaluateCompleteness(
    values,
    requiredAttributesFor(categorySlug),
  ).blocking.every((issue) => issue.field === "stock");
  // Private products do not enter supplier review. A platform block survives owner edits.
  const next = reviewRequired
    ? reviewedNext
    : stored.reviewStatus === "rejected"
      ? "rejected"
      : stored.reviewStatus === "approved" && contentReady
        ? "approved"
        : "draft";
  const resubmitted = next === "in_review" && stored.reviewStatus !== "in_review";
  await transaction
    .update(supplierProducts)
    .set({ ...values, reviewStatus: next, ...(resubmitted ? { submittedAt: now } : {}) })
    .where(eq(supplierProducts.id, stored.id));
}

/**
 * Autosave of the supplier's form. Creates the draft under the id the form generated, so a
 * retried request never duplicates it; edits follow the review rules of `statusAfterEdit`.
 */
export async function saveSupplierPanelDraft(
  database: DatabaseExecutor,
  input: CatalogSaveDraftInput,
  now: Date = new Date(),
): Promise<SupplierPanelProduct> {
  return await database.transaction(async (transaction) => {
    const source = await lockSupplier(transaction, input.supplierId);
    await assertUniqueSku(transaction, input);
    const stored = await lockProduct(transaction, input);
    if (stored !== undefined) {
      await updateDraft(transaction, stored, input, {
        now,
        reviewRequired: source.catalogKind === "supplier",
      });
      return await getSupplierPanelProduct(transaction, input);
    }
    // Opening counts come from the client; only a stored product can preserve a negative shelf.
    if (input.values.stock < 0) {
      throw validationError("Novos produtos não podem ter estoque negativo");
    }
    await categorySlugOf(transaction, input.values.categoryId);
    const created = await transaction
      .insert(supplierProducts)
      .values({
        id: input.productId,
        supplierId: input.supplierId,
        ...input.values,
        reviewStatus: "draft",
      })
      .onConflictDoNothing({ target: supplierProducts.id })
      .returning({ id: supplierProducts.id });
    if (created.length === 0) {
      // The id exists under another supplier: never reveal or touch it.
      throw notFoundError(`Produto ${input.productId} não encontrado neste fornecedor`);
    }
    return await getSupplierPanelProduct(transaction, input);
  });
}

/** Draft → in review, refused while anything blocks publishing. */
export async function submitSupplierPanelProduct(
  database: Database,
  ref: CatalogProductRef,
  now: Date = new Date(),
): Promise<SupplierPanelProduct> {
  return await database.transaction(async (transaction) => {
    const stored = await lockExistingProduct(transaction, ref);
    assertTextsWithoutContact(stored);
    const categorySlug = await categorySlugOf(transaction, stored.categoryId);
    const transition = submitTransition(stored.reviewStatus, blockingCount(stored, categorySlug));
    if (!transition.allowed) {
      throw validationError(transition.message);
    }
    await transaction
      .update(supplierProducts)
      .set({ reviewStatus: transition.next, submittedAt: now })
      .where(eq(supplierProducts.id, stored.id));
    return await getSupplierPanelProduct(transaction, ref);
  });
}

interface ReviewDecision extends CatalogProductRef {
  reviewerId: string;
}

async function decideReview(
  database: Database,
  input: ReviewDecision & { decision: "approve" | "reject"; reasons: readonly RejectionReason[] },
  now: Date,
): Promise<SupplierPanelProduct> {
  return await database.transaction(async (transaction) => {
    const stored = await lockExistingProduct(transaction, input);
    if (input.decision === "approve") {
      assertTextsWithoutContact(stored);
    }
    const transition = reviewTransition(stored.reviewStatus, input.decision);
    if (!transition.allowed) {
      throw conflictError(transition.message);
    }
    await transaction
      .update(supplierProducts)
      .set({
        reviewStatus: transition.next,
        rejectionReasons: [...input.reasons],
        reviewedAt: now,
        reviewedBy: input.reviewerId,
      })
      .where(eq(supplierProducts.id, stored.id));
    return await getSupplierPanelProduct(transaction, input);
  });
}

/** Admin approval: the product becomes visible to resellers and old reasons are cleared. */
export async function approveSupplierPanelProduct(
  database: Database,
  input: ReviewDecision,
  now: Date = new Date(),
): Promise<SupplierPanelProduct> {
  return await decideReview(database, { ...input, decision: "approve", reasons: [] }, now);
}

/** Admin rejection: at least one structured reason, shown on the exact field to the supplier. */
export async function rejectSupplierPanelProduct(
  database: Database,
  input: ReviewDecision & { reasons: readonly RejectionReason[] },
  now: Date = new Date(),
): Promise<SupplierPanelProduct> {
  if (input.reasons.length === 0) {
    throw validationError("Informe pelo menos um motivo da reprovação (recebido: nenhum)");
  }
  return await decideReview(database, { ...input, decision: "reject" }, now);
}
