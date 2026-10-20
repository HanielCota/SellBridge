import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import type { CatalogDraftValues } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, supplierProducts } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair } from "../testing/fixtures.ts";
import {
  activateSellerProduct,
  archiveSellerProduct,
  duplicateSellerProduct,
  getSellerProduct,
  listSellerProducts,
  saveSellerProductDraft,
} from "./seller-catalog.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
const categoryId = randomUUID();

function values(sku: string = randomUUID()): CatalogDraftValues {
  return {
    sku,
    title: "Private cotton shirt",
    description: "Cotton shirt with reinforced seams.",
    costCents: 1200,
    suggestedPriceCents: 3000,
    stock: 10,
    categoryId,
    imageUrls: ["https://images.example.com/private-shirt.jpg"],
    mercadoLivreAttributes: {},
  };
}

async function draft(input = values()) {
  return saveSellerProductDraft(database, tenants.tenantA, {
    productId: randomUUID(),
    values: input,
  });
}

async function expectCode(
  promise: Promise<unknown>,
  code: "NOT_FOUND" | "CONFLICT" | "VALIDATION",
) {
  expect(hasErrorCode(await promise.catch((error: unknown) => error), code)).toBe(true);
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  await database
    .insert(categories)
    .values({ id: categoryId, name: "Private product validation", slug: `seller-${categoryId}` });
});
afterAll(async () => {
  await tenants.cleanup();
  await database.delete(categories).where(eq(categories.id, categoryId));
});

describe("seller product lifecycle", () => {
  it("resumes incomplete drafts and activates complete products without supplier review", async () => {
    const incomplete = await draft({ ...values(), title: "", imageUrls: [] });
    expect(incomplete.reviewStatus).toBe("draft");
    await expectCode(activateSellerProduct(database, tenants.tenantA, incomplete.id), "VALIDATION");
    const completed = await saveSellerProductDraft(database, tenants.tenantA, {
      productId: incomplete.id,
      values: values(incomplete.sku),
      expectedUpdatedAt: incomplete.updatedAt.toISOString(),
      expectedStock: incomplete.stock,
    });
    expect(completed.reviewStatus).toBe("draft");
    const ready = await activateSellerProduct(database, tenants.tenantA, completed.id);
    expect(ready).toMatchObject({ reviewStatus: "approved", reviewedBy: null, submittedAt: null });
  });

  it("keeps ready products ready after content edits and zero-stock counts", async () => {
    const created = await draft();
    const ready = await activateSellerProduct(database, tenants.tenantA, created.id);
    const changed = await saveSellerProductDraft(database, tenants.tenantA, {
      productId: ready.id,
      values: { ...values(ready.sku), title: "Updated private cotton shirt", stock: 0 },
      expectedUpdatedAt: ready.updatedAt.toISOString(),
      expectedStock: ready.stock,
    });
    expect(changed).toMatchObject({ reviewStatus: "approved", stock: 0 });
  });

  it("rejects cross-account reads, writes, activation, archiving and duplication", async () => {
    const created = await draft();
    await expectCode(getSellerProduct(database, tenants.tenantB, created.id), "NOT_FOUND");
    await expectCode(
      saveSellerProductDraft(database, tenants.tenantB, {
        productId: created.id,
        values: values(),
      }),
      "NOT_FOUND",
    );
    await expectCode(activateSellerProduct(database, tenants.tenantB, created.id), "NOT_FOUND");
    await expectCode(archiveSellerProduct(database, tenants.tenantB, created.id), "NOT_FOUND");
    await expectCode(
      duplicateSellerProduct(database, tenants.tenantB, {
        productId: created.id,
        newProductId: randomUUID(),
        newSku: "COPY",
      }),
      "NOT_FOUND",
    );
    expect(
      (
        await listSellerProducts(database, tenants.tenantB, {
          status: "all",
          page: 1,
          pageSize: 100,
        })
      ).items,
    ).toEqual([]);
  });

  it("serializes duplicate SKUs and refuses stale edits instead of overwriting another tab", async () => {
    const sku = randomUUID();
    const attempts = await Promise.allSettled([draft(values(sku)), draft(values(sku))]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const created = await draft();
    const input = {
      productId: created.id,
      values: { ...values(created.sku), title: "First accepted product edit" },
      expectedUpdatedAt: created.updatedAt.toISOString(),
      expectedStock: created.stock,
    };
    await saveSellerProductDraft(database, tenants.tenantA, input);
    await expectCode(
      saveSellerProductDraft(database, tenants.tenantA, {
        ...input,
        values: { ...input.values, title: "Stale second product edit" },
      }),
      "CONFLICT",
    );
    expect((await getSellerProduct(database, tenants.tenantA, created.id)).title).toBe(
      input.values.title,
    );
  });

  it("archives drafts and restores ready products without losing their history", async () => {
    const created = await draft();
    await archiveSellerProduct(database, tenants.tenantA, created.id);
    const archived = await listSellerProducts(database, tenants.tenantA, {
      status: "archived",
      query: created.sku,
      page: 1,
      pageSize: 25,
    });
    expect(archived.items.map((product) => product.id)).toEqual([created.id]);
    const restored = await activateSellerProduct(database, tenants.tenantA, created.id);
    expect(restored.active).toBe(true);
    expect(restored.createdAt).toEqual(created.createdAt);
  });

  it("duplicates content into a new draft without duplicating stock or reservations", async () => {
    const created = await draft();
    const copied = await duplicateSellerProduct(database, tenants.tenantA, {
      productId: created.id,
      newProductId: randomUUID(),
      newSku: `COPY-${randomUUID()}`,
    });
    expect(copied.id).not.toBe(created.id);
    expect(copied).toMatchObject({
      title: created.title,
      stock: 0,
      reservedStock: 0,
      reviewStatus: "draft",
    });
    expect(copied.imageUrls).toEqual(created.imageUrls);
  });

  it("preserves a platform block through owner edits and refuses activation or duplication", async () => {
    const created = await draft();
    await database
      .update(supplierProducts)
      .set({
        active: false,
        reviewStatus: "rejected",
        rejectionReasons: [
          {
            field: "title",
            rule: "platform_block",
            message: "The platform requires a compliance correction.",
          },
        ],
      })
      .where(eq(supplierProducts.id, created.id));
    const blocked = await getSellerProduct(database, tenants.tenantA, created.id);
    const saved = await saveSellerProductDraft(database, tenants.tenantA, {
      productId: created.id,
      values: { ...values(created.sku), title: "Corrected product title" },
      expectedUpdatedAt: blocked.updatedAt.toISOString(),
      expectedStock: blocked.stock,
    });
    expect(saved).toMatchObject({
      active: false,
      reviewStatus: "rejected",
      rejectionReasons: blocked.rejectionReasons,
    });
    await expectCode(activateSellerProduct(database, tenants.tenantA, created.id), "VALIDATION");
    await expectCode(
      duplicateSellerProduct(database, tenants.tenantA, {
        productId: created.id,
        newProductId: randomUUID(),
        newSku: "BLOCKED-COPY",
      }),
      "VALIDATION",
    );
  });
});
