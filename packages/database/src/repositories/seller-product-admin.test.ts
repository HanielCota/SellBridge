import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import type { CatalogDraftValues } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminAuditEvents, categories } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import { getSellerProduct, saveSellerProductDraft } from "./seller-catalog.ts";
import {
  actOnAdminSellerProduct,
  inspectSellerProduct,
  listAdminCatalogProducts,
  saveAdminSellerProduct,
} from "./seller-product-admin.ts";

const database = createTestDatabase();
const categoryId = randomUUID();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let actors: Awaited<ReturnType<typeof createTestUsers>>;
let adminId = "";

function values(sku: string = randomUUID()): CatalogDraftValues {
  return {
    sku,
    title: "Managed private accessory",
    description: "A customer-owned accessory.",
    costCents: 1000,
    suggestedPriceCents: 2500,
    stock: 8,
    categoryId,
    imageUrls: ["https://images.example.com/accessory.jpg"],
    mercadoLivreAttributes: {},
  };
}
async function createProduct() {
  return saveSellerProductDraft(database, tenants.tenantA, {
    productId: randomUUID(),
    values: values(),
  });
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  actors = await createTestUsers(database, 1);
  const actor = actors.ids[0];
  if (actor === undefined) throw new Error("Missing admin fixture");
  adminId = actor;
  await database.insert(categories).values({
    id: categoryId,
    name: "Admin product validation",
    slug: `admin-product-${categoryId}`,
  });
});
afterAll(async () => {
  await database.delete(adminAuditEvents).where(eq(adminAuditEvents.adminId, adminId));
  await tenants.cleanup();
  await actors.cleanup();
  await database.delete(categories).where(eq(categories.id, categoryId));
});

describe("administrative seller product interventions", () => {
  it("commits a reason, actor and changed fields with each correction", async () => {
    const created = await createProduct();
    const updated = await saveAdminSellerProduct(database, {
      adminId,
      tenantId: tenants.tenantA,
      productId: created.id,
      reason: "Corrected the product title.",
      values: { ...values(created.sku), title: "Corrected private accessory" },
      expectedUpdatedAt: created.updatedAt.toISOString(),
      expectedStock: created.stock,
    });
    const view = await inspectSellerProduct(database, tenants.tenantA, created.id);
    expect(updated.title).toBe("Corrected private accessory");
    expect(view.history).toHaveLength(1);
    expect(view.history[0]).toMatchObject({
      action: "product.seller_updated",
      details: {
        tenantId: tenants.tenantA,
        reason: "Corrected the product title.",
        fields: "title",
      },
    });
    const [event] = await database
      .select()
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.entityId, created.id));
    expect(event?.adminId).toBe(adminId);
  });

  it("rolls back the product correction when the audit cannot be recorded", async () => {
    const created = await createProduct();
    await expect(
      saveAdminSellerProduct(database, {
        adminId: randomUUID(),
        tenantId: tenants.tenantA,
        productId: created.id,
        reason: "This actor does not exist.",
        values: { ...values(created.sku), title: "Must never be committed" },
        expectedUpdatedAt: created.updatedAt.toISOString(),
        expectedStock: created.stock,
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    expect((await getSellerProduct(database, tenants.tenantA, created.id)).title).toBe(
      created.title,
    );
    expect((await inspectSellerProduct(database, tenants.tenantA, created.id)).history).toEqual([]);
  });

  it("rejects missing reasons and mismatched customer scopes without audit side effects", async () => {
    const created = await createProduct();
    const blank = await actOnAdminSellerProduct(database, {
      adminId,
      tenantId: tenants.tenantA,
      productId: created.id,
      reason: "",
      action: "block",
    }).catch((error: unknown) => error);
    expect(hasErrorCode(blank, "VALIDATION")).toBe(true);
    const mismatch = await actOnAdminSellerProduct(database, {
      adminId,
      tenantId: tenants.tenantB,
      productId: created.id,
      reason: "Wrong customer account.",
      action: "archive",
    }).catch((error: unknown) => error);
    expect(hasErrorCode(mismatch, "NOT_FOUND")).toBe(true);
    expect((await getSellerProduct(database, tenants.tenantA, created.id)).active).toBe(true);
    expect((await inspectSellerProduct(database, tenants.tenantA, created.id)).history).toEqual([]);
  });

  it("records block and unblock decisions and requires explicit reactivation", async () => {
    const created = await createProduct();
    const scope = { adminId, tenantId: tenants.tenantA, productId: created.id };
    const blocked = await actOnAdminSellerProduct(database, {
      ...scope,
      reason: "Correct the item description.",
      action: "block",
    });
    expect(blocked).toMatchObject({ active: false, reviewStatus: "rejected", reviewedBy: adminId });
    const unblocked = await actOnAdminSellerProduct(database, {
      ...scope,
      reason: "The required correction was verified.",
      action: "unblock",
    });
    expect(unblocked).toMatchObject({ active: false, reviewStatus: "draft" });
    const activated = await actOnAdminSellerProduct(database, {
      ...scope,
      reason: "The customer requested activation.",
      action: "activate",
    });
    expect(activated).toMatchObject({ active: true, reviewStatus: "approved" });
    expect(
      (await inspectSellerProduct(database, tenants.tenantA, created.id)).history,
    ).toHaveLength(3);
  });

  it("filters the admin catalog by customer and origin", async () => {
    const created = await createProduct();
    const own = await listAdminCatalogProducts(database, {
      origin: "seller",
      tenantId: tenants.tenantA,
      query: created.sku,
      page: 1,
      pageSize: 25,
    });
    expect(own.items.map((row) => row.product.id)).toEqual([created.id]);
    expect(
      (
        await listAdminCatalogProducts(database, {
          origin: "supplier",
          tenantId: tenants.tenantA,
          query: created.sku,
          page: 1,
          pageSize: 25,
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await listAdminCatalogProducts(database, {
          origin: "seller",
          tenantId: tenants.tenantB,
          query: created.sku,
          page: 1,
          pageSize: 25,
        })
      ).items,
    ).toEqual([]);
  });
});
