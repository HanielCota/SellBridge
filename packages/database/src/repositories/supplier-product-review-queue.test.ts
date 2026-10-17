import { randomUUID } from "node:crypto";
import type { CatalogDraftValues } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { categories, supplierProducts } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { saveAdminSupplier } from "./admin-suppliers.ts";
import {
  approveSupplierPanelProduct,
  rejectSupplierPanelProduct,
  saveSupplierPanelDraft,
  submitSupplierPanelProduct,
} from "./supplier-panel-catalog-writes.ts";
import {
  countProductsAwaitingReview,
  getProductForReview,
  listProductsAwaitingReview,
} from "./supplier-product-review-queue.ts";
import { listCatalogProducts } from "./suppliers.ts";

const database = createTestDatabase();
const marker = `Fila ${randomUUID().slice(0, 8)}`;
const REVIEWER = "admin-reviewer";
const PAGE = { page: 1, pageSize: 50 };
let supplierId = "";
let otherSupplierId = "";
let categoryId = "";

function readyValues(sku: string): CatalogDraftValues {
  return {
    sku,
    title: `${marker} camiseta ${sku}`,
    description: "Algodão penteado",
    costCents: 2500,
    suggestedPriceCents: 4990,
    stock: 8,
    categoryId,
    imageUrls: ["https://imagens.test/1.jpg"],
    mercadoLivreAttributes: {},
  };
}

async function submitted(sku: string, submittedAt: Date, owner = supplierId) {
  const productId = randomUUID();
  await saveSupplierPanelDraft(database, {
    supplierId: owner,
    productId,
    values: readyValues(sku),
  });
  await submitSupplierPanelProduct(database, { supplierId: owner, productId }, submittedAt);
  return productId;
}

async function queueIds(): Promise<string[]> {
  const queue = await listProductsAwaitingReview(database, { query: marker, page: 1 });
  return queue.items.map((product) => product.id);
}

beforeAll(async () => {
  const supplier = {
    name: `${marker} fornecedor`,
    niche: "Teste",
    description: "",
    state: "SP" as const,
    city: "Campinas",
    logoUrl: null,
    contactEmail: null,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
  };
  supplierId = (await saveAdminSupplier(database, supplier)).id;
  otherSupplierId = (await saveAdminSupplier(database, { ...supplier, name: "Outro" })).id;
  const [category] = await database
    .insert(categories)
    .values({ name: "Fila teste", slug: `fila-${randomUUID()}` })
    .returning();
  categoryId = category?.id ?? "";
});

describe("listProductsAwaitingReview", () => {
  it("lists every supplier's products in review, oldest submission first", async () => {
    const newer = await submitted("Q-NEWER", new Date("2026-10-16T12:00:00Z"));
    const older = await submitted("Q-OLDER", new Date("2026-10-15T12:00:00Z"), otherSupplierId);
    const draftId = randomUUID();
    await saveSupplierPanelDraft(database, {
      supplierId,
      productId: draftId,
      values: readyValues("Q-DRAFT"),
    });
    const ids = await queueIds();
    expect(ids).toEqual([older, newer]);
    expect(ids).not.toContain(draftId);
  });

  it("tells a first review apart from a change to a product already reviewed", async () => {
    const productId = await submitted("Q-KIND", new Date("2026-10-14T12:00:00Z"));
    const first = await getProductForReview(database, productId);
    expect(first.product.kind).toBe("new");
    expect(first.product.supplierName).toBe(`${marker} fornecedor`);
    await database
      .update(supplierProducts)
      .set({ reviewedAt: new Date("2026-10-01T00:00:00Z") })
      .where(eq(supplierProducts.id, productId));
    const again = await getProductForReview(database, productId);
    expect(again.product.kind).toBe("change");
  });
});

describe("review decisions", () => {
  it("makes an approved product visible to resellers and keeps a rejected one hidden", async () => {
    const approved = await submitted("Q-APPROVE", new Date("2026-10-13T12:00:00Z"));
    const rejected = await submitted("Q-REJECT", new Date("2026-10-13T13:00:00Z"));
    const before = await listCatalogProducts(database, supplierId, { sort: "title" }, PAGE);
    expect(before.items.map((product) => product.id)).not.toContain(approved);

    await approveSupplierPanelProduct(database, {
      supplierId,
      productId: approved,
      reviewerId: REVIEWER,
    });
    await rejectSupplierPanelProduct(database, {
      supplierId,
      productId: rejected,
      reviewerId: REVIEWER,
      reasons: [{ field: "imageUrls", rule: "image_quality", message: "Use fundo branco." }],
    });

    const after = await listCatalogProducts(database, supplierId, { sort: "title" }, PAGE);
    const visible = after.items.map((product) => product.id);
    expect(visible).toContain(approved);
    expect(visible).not.toContain(rejected);
    expect(await queueIds()).not.toEqual(expect.arrayContaining([approved, rejected]));
  });

  it("counts what waits and points to the next product in the queue", async () => {
    const countBefore = await countProductsAwaitingReview(database);
    const first = await submitted("Q-NEXT-1", new Date("2026-01-01T00:00:00Z"));
    const second = await submitted("Q-NEXT-2", new Date("2026-01-01T00:01:00Z"));
    expect(await countProductsAwaitingReview(database)).toBe(countBefore + 2);
    const opened = await getProductForReview(database, first);
    expect(opened.nextProductId).not.toBe(first);
    expect(opened.nextProductId).not.toBeNull();
    const fromSecond = await getProductForReview(database, second);
    expect(fromSecond.nextProductId).toBe(first);
  });

  it("reads an unknown product as not found", async () => {
    await expect(getProductForReview(database, randomUUID())).rejects.toThrow(/não encontrado/);
  });
});
