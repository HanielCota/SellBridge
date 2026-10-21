import { changedProductFields } from "@sellbridge/shared/supplier-panel-catalog-status";
import { hasErrorCode, validationError } from "@sellbridge/shared/errors";
import type { SellerSaveProductInput } from "@sellbridge/shared/seller-catalog-schemas";
import { toPaginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { Database, Transaction } from "../client.ts";
import {
  adminAuditEvents,
  listings,
  listingTargets,
  organization,
  storeConnections,
  supplierProducts,
  suppliers,
  user,
} from "../schema/index.ts";
import {
  activateSellerProduct,
  archiveSellerProduct,
  getSellerProduct,
  saveSellerProductDraft,
} from "./seller-catalog.ts";
import { setListingsPaused } from "./listing-actions.ts";
import { matchesEveryWord } from "./sql/search-pattern.ts";

export interface AdminSellerAction {
  adminId: string;
  tenantId: string;
  productId: string;
  reason: string;
  fields?: string | undefined;
}

/** The audit record commits with the mutation; an audit failure rolls everything back. */
async function audited<TResult>(
  database: Database,
  input: AdminSellerAction,
  action: string,
  run: (transaction: Transaction) => Promise<TResult>,
) {
  if (input.reason.trim().length < 5)
    throw validationError("Explique o motivo da alteração com pelo menos 5 caracteres.");
  return database.transaction(async (transaction) => {
    const result = await run(transaction);
    await transaction.insert(adminAuditEvents).values({
      adminId: input.adminId,
      entityType: "product",
      entityId: input.productId,
      action,
      details: {
        tenantId: input.tenantId,
        reason: input.reason.trim(),
        fields: input.fields ?? null,
      },
    });
    return result;
  });
}

export async function saveAdminSellerProduct(
  database: Database,
  input: AdminSellerAction & SellerSaveProductInput,
) {
  const auditInput = { ...input, fields: "" };
  return audited(database, auditInput, "product.seller_updated", async (transaction) => {
    const before = await getSellerProduct(transaction, input.tenantId, input.productId).catch(
      (error: unknown) => {
        if (hasErrorCode(error, "NOT_FOUND")) return null;
        throw error;
      },
    );
    const product = await saveSellerProductDraft(transaction, input.tenantId, input);
    auditInput.fields =
      before === null ? "created" : changedProductFields(before, product).join(",");
    return product;
  });
}

export async function actOnAdminSellerProduct(
  database: Database,
  input: AdminSellerAction & { action: "activate" | "archive" | "block" | "unblock" },
) {
  return audited(database, input, `product.seller_${input.action}`, async (transaction) => {
    if (input.action === "activate")
      return activateSellerProduct(transaction, input.tenantId, input.productId);
    if (input.action === "archive")
      return (await archiveSellerProduct(transaction, input.tenantId, input.productId)).product;
    await archiveSellerProduct(transaction, input.tenantId, input.productId);
    await transaction
      .update(supplierProducts)
      .set(
        input.action === "block"
          ? {
              reviewStatus: "rejected",
              rejectionReasons: [
                { field: "title", rule: "platform_block", message: input.reason.trim() },
              ],
              reviewedBy: input.adminId,
              reviewedAt: new Date(),
            }
          : {
              reviewStatus: "draft",
              rejectionReasons: [],
              reviewedBy: input.adminId,
              reviewedAt: new Date(),
            },
      )
      .where(eq(supplierProducts.id, input.productId));
    return getSellerProduct(transaction, input.tenantId, input.productId);
  });
}

export async function setAdminSellerPublicationsPaused(
  database: Database,
  input: AdminSellerAction & { paused: boolean },
) {
  return audited(
    database,
    input,
    input.paused ? "product.publications_paused" : "product.publications_resumed",
    async (transaction) => {
      await getSellerProduct(transaction, input.tenantId, input.productId);
      const rows = await transaction
        .select({ id: listings.id })
        .from(listings)
        .where(
          and(
            eq(listings.tenantId, input.tenantId),
            eq(listings.supplierProductId, input.productId),
          ),
        );
      if (rows.length === 0) return 0;
      return setListingsPaused(
        transaction,
        input.tenantId,
        rows.map((row) => row.id),
        input.paused,
      );
    },
  );
}

export async function listAdminCatalogProducts(
  database: Database,
  input: Pagination & {
    query?: string | undefined;
    origin: "all" | "seller" | "supplier";
    tenantId?: string | undefined;
  },
) {
  const condition = and(
    input.origin === "all" ? undefined : eq(suppliers.catalogKind, input.origin),
    input.tenantId === undefined ? undefined : eq(suppliers.ownerTenantId, input.tenantId),
    input.query === undefined
      ? undefined
      : matchesEveryWord(input.query, [
          supplierProducts.title,
          supplierProducts.sku,
          suppliers.name,
          organization.name,
        ]),
  );
  const query = () =>
    database
      .select({
        product: supplierProducts,
        sourceId: suppliers.id,
        sourceName: suppliers.name,
        origin: suppliers.catalogKind,
        tenantId: suppliers.ownerTenantId,
        ownerName: organization.name,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .leftJoin(organization, eq(organization.id, suppliers.ownerTenantId));
  const [total] = await database
    .select({ value: count() })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(organization, eq(organization.id, suppliers.ownerTenantId))
    .where(condition);
  const rows = await query()
    .where(condition)
    .orderBy(desc(supplierProducts.updatedAt), asc(supplierProducts.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return toPaginated(rows, total?.value ?? 0, input);
}

export async function inspectSellerProduct(
  database: Database,
  tenantId: string,
  productId: string,
) {
  const product = await getSellerProduct(database, tenantId, productId);
  const publications = await database
    .select({
      id: listingTargets.id,
      listingId: listings.id,
      title: listings.title,
      priceCents: listings.priceCents,
      storeName: storeConnections.shopName,
      status: listingTargets.status,
      error: listingTargets.errorReason,
      url: listingTargets.externalUrl,
    })
    .from(listings)
    .innerJoin(listingTargets, eq(listingTargets.listingId, listings.id))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(and(eq(listings.tenantId, tenantId), eq(listings.supplierProductId, productId)));
  const history = await database
    .select({
      id: adminAuditEvents.id,
      action: adminAuditEvents.action,
      details: adminAuditEvents.details,
      createdAt: adminAuditEvents.createdAt,
      actor: user.name,
    })
    .from(adminAuditEvents)
    .leftJoin(user, eq(user.id, adminAuditEvents.adminId))
    .where(
      and(eq(adminAuditEvents.entityType, "product"), eq(adminAuditEvents.entityId, productId)),
    )
    .orderBy(desc(adminAuditEvents.createdAt))
    .limit(100);
  return { product, publications, history };
}
