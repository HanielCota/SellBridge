import type { SellerProductStatus } from "@sellbridge/shared/seller-catalog-schemas";
import { notFoundError, validationError } from "@sellbridge/shared/errors";
import type { CatalogSaveDraftInput } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { toPaginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  categories,
  listings,
  listingTargets,
  organization,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { panelProductColumns, withPanelCompleteness } from "./supplier-panel-catalog.ts";
import { saveSupplierPanelDraft } from "./supplier-panel-catalog-writes.ts";
import { matchesEveryWord } from "./sql/search-pattern.ts";

/** Private sources reuse the inventory identity without making the seller a public supplier. */
export async function findSellerCatalog(database: DatabaseExecutor, tenantId: string) {
  const [source] = await database
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.catalogKind, "seller"), eq(suppliers.ownerTenantId, tenantId)));
  return source ?? null;
}

/** Serialize first creation on the tenant so parallel tabs always get the same source. */
export async function ensureSellerCatalog(database: Database, tenantId: string) {
  return database.transaction(async (transaction) => {
    const [owner] = await transaction
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(and(eq(organization.id, tenantId), eq(organization.kind, "seller")))
      .for("update");
    if (owner === undefined) throw notFoundError("Seller account not found");
    const existing = await findSellerCatalog(transaction, tenantId);
    if (existing !== null) return existing;
    const [created] = await transaction
      .insert(suppliers)
      .values({
        name: owner.name,
        catalogKind: "seller",
        ownerTenantId: tenantId,
        // Public supplier metadata does not apply to a self-fulfilled private catalog.
        niche: "",
        state: "",
        city: "",
      })
      .returning();
    if (created === undefined) throw new Error("Seller catalog was not created");
    return created;
  });
}

/** A product identifier is never sufficient authorization to read a private product. */
export async function getSellerProduct(
  database: DatabaseExecutor,
  tenantId: string,
  productId: string,
) {
  const [row] = await database
    .select(panelProductColumns)
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(
      and(
        eq(supplierProducts.id, productId),
        eq(suppliers.catalogKind, "seller"),
        eq(suppliers.ownerTenantId, tenantId),
      ),
    );
  if (row === undefined) throw notFoundError("Product not found in this account");
  return withPanelCompleteness(row);
}

export type { SellerProductStatus } from "@sellbridge/shared/seller-catalog-schemas";

export async function listSellerProducts(
  database: DatabaseExecutor,
  tenantId: string,
  input: Pagination & { query?: string; status: SellerProductStatus },
) {
  const statusCondition = {
    all: undefined,
    draft: and(eq(supplierProducts.active, true), eq(supplierProducts.reviewStatus, "draft")),
    ready: and(eq(supplierProducts.active, true), eq(supplierProducts.reviewStatus, "approved")),
    archived: and(
      eq(supplierProducts.active, false),
      ne(supplierProducts.reviewStatus, "rejected"),
    ),
    blocked: eq(supplierProducts.reviewStatus, "rejected"),
  }[input.status];
  const condition = and(
    eq(suppliers.catalogKind, "seller"),
    eq(suppliers.ownerTenantId, tenantId),
    statusCondition,
    input.query === undefined
      ? undefined
      : matchesEveryWord(input.query, [supplierProducts.sku, supplierProducts.title]),
  );
  const [total] = await database
    .select({ value: count() })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(condition);
  const rows = await database
    .select(panelProductColumns)
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(condition)
    .orderBy(desc(supplierProducts.updatedAt), asc(supplierProducts.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return toPaginated(rows.map(withPanelCompleteness), total?.value ?? 0, input);
}

async function lockSellerCatalog(database: DatabaseExecutor, tenantId: string) {
  const [source] = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.catalogKind, "seller"), eq(suppliers.ownerTenantId, tenantId)))
    .for("update");
  if (source === undefined) throw notFoundError("Seller catalog not found");
  return source;
}

/** The source is resolved from the authenticated tenant, never from a submitted source id. */
export async function saveSellerProductDraft(
  database: Database,
  tenantId: string,
  input: Omit<CatalogSaveDraftInput, "supplierId">,
) {
  await ensureSellerCatalog(database, tenantId);
  return database.transaction(async (transaction) => {
    const source = await lockSellerCatalog(transaction, tenantId);
    return saveSupplierPanelDraft(transaction, { ...input, supplierId: source.id });
  });
}

/** Ready products are publishable immediately; suppliers' approval rules do not apply. */
export async function activateSellerProduct(
  database: Database,
  tenantId: string,
  productId: string,
) {
  return database.transaction(async (transaction) => {
    await lockSellerCatalog(transaction, tenantId);
    const product = await getSellerProduct(transaction, tenantId, productId);
    if (product.reviewStatus === "rejected")
      throw validationError(
        "This product is blocked by the platform. Contact support to request a review.",
      );
    if (!product.completeness.canSubmit)
      throw validationError(
        "Complete the required product fields before making it ready to publish.",
      );
    await transaction
      .update(supplierProducts)
      .set({
        active: true,
        reviewStatus: "approved",
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReasons: [],
      })
      .where(eq(supplierProducts.id, productId));
    return getSellerProduct(transaction, tenantId, productId);
  });
}

/** Archiving preserves orders and pauses live listings; restoring never republishes them. */
export async function archiveSellerProduct(
  database: Database,
  tenantId: string,
  productId: string,
) {
  return database.transaction(async (transaction) => {
    await lockSellerCatalog(transaction, tenantId);
    await getSellerProduct(transaction, tenantId, productId);
    await transaction
      .update(supplierProducts)
      .set({ active: false })
      .where(eq(supplierProducts.id, productId));
    const productListings = transaction
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.tenantId, tenantId), eq(listings.supplierProductId, productId)));
    const paused = await transaction
      .update(listingTargets)
      .set({ status: "paused" })
      .where(
        and(
          eq(listingTargets.tenantId, tenantId),
          eq(listingTargets.status, "published"),
          inArray(listingTargets.listingId, productListings),
        ),
      )
      .returning({ id: listingTargets.id });
    return {
      product: await getSellerProduct(transaction, tenantId, productId),
      pausedTargets: paused.length,
    };
  });
}

/** Copying creates a distinct draft with no inventory or reservations carried over. */
export async function duplicateSellerProduct(
  database: Database,
  tenantId: string,
  input: { productId: string; newProductId: string; newSku: string },
) {
  const { productId, newProductId, newSku } = input;
  const product = await getSellerProduct(database, tenantId, productId);
  if (product.reviewStatus === "rejected")
    throw validationError("Blocked products cannot be duplicated.");
  return saveSellerProductDraft(database, tenantId, {
    productId: newProductId,
    values: {
      sku: newSku,
      title: product.title,
      description: product.description,
      costCents: product.costCents,
      suggestedPriceCents: product.suggestedPriceCents,
      stock: 0,
      categoryId: product.categoryId,
      imageUrls: product.imageUrls,
      mercadoLivreAttributes: product.mercadoLivreAttributes,
    },
  });
}
