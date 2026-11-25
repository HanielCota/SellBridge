import {
  type AdminSupplier,
  type AdminSupplierProduct,
  listAdminSupplierProducts,
  listAdminSuppliers,
} from "@sellbridge/database/repositories";
import { z } from "zod";
import { noInput, pageQuerySchema, toPaginationMeta } from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";

/** Contact e-mail and fiscal profile stay out: they are the supplier's, not catalog data. */
function presentSupplier(supplier: AdminSupplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    niche: supplier.niche,
    description: supplier.description,
    state: supplier.state,
    city: supplier.city,
    logoUrl: supplier.logoUrl,
    active: supplier.active,
    approvalStatus: supplier.approvalStatus,
    acceptWithinHours: supplier.acceptWithinHours,
    dispatchWithinHours: supplier.dispatchWithinHours,
    organizationId: supplier.organizationId,
    createdAt: supplier.createdAt.toISOString(),
  };
}

function presentSupplierProduct(product: AdminSupplierProduct) {
  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    color: product.color,
    size: product.size,
    costCents: product.costCents,
    suggestedPriceCents: product.suggestedPriceCents,
    stock: product.stock,
    reservedStock: product.reservedStock,
    active: product.active,
    reviewStatus: product.reviewStatus,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export const listDeveloperSuppliers = defineDeveloperEndpoint({
  operationId: "listSuppliers",
  scope: "suppliers:read",
  params: noInput,
  query: pageQuerySchema,
  handle: async ({ query }) => {
    const page = await listAdminSuppliers(database, undefined, query);
    return { data: page.items.map(presentSupplier), pagination: toPaginationMeta(page) };
  },
});

export const listDeveloperSupplierProducts = defineDeveloperEndpoint({
  operationId: "listSupplierProducts",
  scope: "suppliers:read",
  params: z.object({ supplierId: z.uuid() }),
  query: pageQuerySchema,
  handle: async ({ params, query }) => {
    const page = await listAdminSupplierProducts(database, params.supplierId, undefined, query);
    return { data: page.items.map(presentSupplierProduct), pagination: toPaginationMeta(page) };
  },
});
