import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import { SUPPLIER_TEXT_CONTACT_REFUSED } from "@sellbridge/shared/schemas";
import type {
  CatalogDraftValues,
  CatalogListSearch,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { saveAdminSupplier, saveAdminSupplierProduct } from "./admin-suppliers.ts";
import { getSupplierPanelProduct, listSupplierPanelProducts } from "./supplier-panel-catalog.ts";
import {
  approveSupplierPanelProduct,
  rejectSupplierPanelProduct,
  saveSupplierPanelDraft,
  submitSupplierPanelProduct,
} from "./supplier-panel-catalog-writes.ts";

const database = createTestDatabase();
let supplierId = "";
let otherSupplierId = "";
let categoryId = "";
const REVIEWER = "admin-user-id";
const LIST: CatalogListSearch = {
  status: "all",
  query: undefined,
  sort: "updatedAt",
  direction: "desc",
  page: 1,
  pageSize: 25,
};

function readyValues(sku: string): CatalogDraftValues {
  return {
    sku,
    title: "Camiseta básica algodão - Preta",
    description: "Algodão",
    costCents: 2500,
    suggestedPriceCents: 4990,
    stock: 8,
    categoryId,
    imageUrls: ["https://imagens.test/1.jpg"],
    mercadoLivreAttributes: {},
  };
}

async function readyInReview(sku: string) {
  const productId = randomUUID();
  await saveSupplierPanelDraft(database, { supplierId, productId, values: readyValues(sku) });
  return await submitSupplierPanelProduct(database, { supplierId, productId });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

async function expectAppError(
  promise: Promise<unknown>,
  code: "CONFLICT" | "VALIDATION" | "NOT_FOUND",
) {
  const error = await caught(promise);
  expect(hasErrorCode(error, code)).toBe(true);
  return error;
}

beforeAll(async () => {
  const supplier = {
    name: `Painel catálogo ${randomUUID()}`,
    niche: "Teste",
    description: "",
    state: "SP" as const,
    city: "São Paulo",
    logoUrl: null,
    contactEmail: null,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
  };
  supplierId = (await saveAdminSupplier(database, supplier)).id;
  otherSupplierId = (await saveAdminSupplier(database, { ...supplier, name: "Outro painel" })).id;
  const [category] = await database
    .insert(categories)
    .values({ name: "Painel teste", slug: `painel-${randomUUID()}` })
    .returning();
  categoryId = category?.id ?? "";
});

// The suppliers and the "Painel teste" category used to stay in the database after each run and
// showed up in the supplier form's category list during demos.
afterAll(async () => {
  const testSuppliers = [supplierId, otherSupplierId];
  await database
    .delete(supplierProducts)
    .where(inArray(supplierProducts.supplierId, testSuppliers));
  await database.delete(suppliers).where(inArray(suppliers.id, testSuppliers));
  await database.delete(categories).where(eq(categories.id, categoryId));
});

describe("saveSupplierPanelDraft", () => {
  it("rejects a new draft with a fabricated negative opening count", async () => {
    const productId = randomUUID();
    await expectAppError(
      saveSupplierPanelDraft(database, {
        supplierId,
        productId,
        expectedStock: -3,
        values: { ...readyValues("NEGATIVE-CREATE"), stock: -3 },
      }),
      "VALIDATION",
    );
    const stored = await database
      .select()
      .from(supplierProducts)
      .where(eq(supplierProducts.id, productId));
    expect(stored).toEqual([]);
  });

  it("keeps a negative shelf editable without overwriting later sales", async () => {
    const productId = randomUUID();
    const values = readyValues("NEGATIVE-EDIT");
    await saveSupplierPanelDraft(database, { supplierId, productId, values });
    await database
      .update(supplierProducts)
      .set({ stock: -3 })
      .where(eq(supplierProducts.id, productId));
    const opened = await getSupplierPanelProduct(database, { supplierId, productId });
    await database
      .update(supplierProducts)
      .set({ stock: -4 })
      .where(eq(supplierProducts.id, productId));
    const current = await getSupplierPanelProduct(database, { supplierId, productId });
    const saved = await saveSupplierPanelDraft(database, {
      supplierId,
      productId,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      expectedStock: opened.stock,
      values: { ...values, stock: opened.stock, title: "Updated title" },
    });
    expect(saved.title).toBe("Updated title");
    expect(saved.stock).toBe(-4);
  });

  it("creates a draft once under the form's id, even when the autosave is retried", async () => {
    const productId = randomUUID();
    const input = { supplierId, productId, values: { ...readyValues("DRAFT-1"), title: "" } };
    const first = await saveSupplierPanelDraft(database, input);
    const retried = await saveSupplierPanelDraft(database, input);
    expect(first.reviewStatus).toBe("draft");
    expect(retried.updatedAt).toEqual(first.updatedAt);
    expect(first.completeness.blocking.map((issue) => issue.field)).toEqual(["title"]);
  });

  it("refuses an edit over a version the form never saw, but accepts a retried save", async () => {
    const productId = randomUUID();
    const created = await saveSupplierPanelDraft(database, {
      supplierId,
      productId,
      values: readyValues("DRAFT-2"),
    });
    const expectedUpdatedAt = created.updatedAt.toISOString();
    const edit = { supplierId, productId, expectedUpdatedAt };
    const saved = await saveSupplierPanelDraft(database, {
      ...edit,
      values: { ...readyValues("DRAFT-2"), title: "Primeira edição do título" },
    });
    const retried = await saveSupplierPanelDraft(database, {
      ...edit,
      values: { ...readyValues("DRAFT-2"), title: "Primeira edição do título" },
    });
    expect(retried.updatedAt).toEqual(saved.updatedAt);
    await expectAppError(
      saveSupplierPanelDraft(database, {
        ...edit,
        values: { ...readyValues("DRAFT-2"), title: "Edição de outra aba" },
      }),
      "CONFLICT",
    );
  });

  it("does not write back a shelf count that sales moved after the form opened", async () => {
    const productId = randomUUID();
    const created = await saveSupplierPanelDraft(database, {
      supplierId,
      productId,
      values: readyValues("DRAFT-3"),
    });
    await database
      .update(supplierProducts)
      .set({ stock: 5 })
      .where(eq(supplierProducts.id, productId));
    const current = await getSupplierPanelProduct(database, { supplierId, productId });
    const kept = await saveSupplierPanelDraft(database, {
      supplierId,
      productId,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      expectedStock: created.stock,
      values: { ...readyValues("DRAFT-3"), description: "Nova descrição" },
    });
    expect(kept.stock).toBe(5);
    await expectAppError(
      saveSupplierPanelDraft(database, {
        supplierId,
        productId,
        expectedUpdatedAt: kept.updatedAt.toISOString(),
        expectedStock: created.stock,
        values: { ...readyValues("DRAFT-3"), stock: 20 },
      }),
      "CONFLICT",
    );
  });

  it("refuses a SKU the supplier already uses, an unknown category and another supplier's id", async () => {
    expect.assertions(3);
    await saveAdminSupplierProduct(database, { supplierId, ...readyValues("TAKEN") });
    await expectAppError(
      saveSupplierPanelDraft(database, {
        supplierId,
        productId: randomUUID(),
        values: readyValues("TAKEN"),
      }),
      "CONFLICT",
    );
    await expectAppError(
      saveSupplierPanelDraft(database, {
        supplierId,
        productId: randomUUID(),
        values: { ...readyValues("NO-CATEGORY"), categoryId: randomUUID() },
      }),
      "VALIDATION",
    );
    const foreign = await saveSupplierPanelDraft(database, {
      supplierId: otherSupplierId,
      productId: randomUUID(),
      values: readyValues("FOREIGN"),
    });
    await expectAppError(
      saveSupplierPanelDraft(database, {
        supplierId,
        productId: foreign.id,
        values: readyValues("MINE"),
      }),
      "NOT_FOUND",
    );
  });
});

describe("review flow", () => {
  // Texts saved before the contact rule (or written past the form) are checked again here.
  it("refuses to submit or approve a product whose saved texts carry a contact", async () => {
    const productId = randomUUID();
    await saveSupplierPanelDraft(database, {
      supplierId,
      productId,
      values: readyValues("CONTACT"),
    });
    await database
      .update(supplierProducts)
      .set({ description: "Compre direto: WhatsApp 11 98765-4321" })
      .where(eq(supplierProducts.id, productId));
    const refused = await expectAppError(
      submitSupplierPanelProduct(database, { supplierId, productId }),
      "VALIDATION",
    );
    expect(String(refused)).toContain(SUPPLIER_TEXT_CONTACT_REFUSED);

    const submitted = await readyInReview("CONTACT-2");
    await database
      .update(supplierProducts)
      .set({ mercadoLivreAttributes: { BRAND: "insta: atelie.moda" } })
      .where(eq(supplierProducts.id, submitted.id));
    await expectAppError(
      approveSupplierPanelProduct(database, {
        supplierId,
        productId: submitted.id,
        reviewerId: REVIEWER,
      }),
      "VALIDATION",
    );
  });

  it("refuses to submit a draft with blocking issues", async () => {
    const productId = randomUUID();
    await saveSupplierPanelDraft(database, {
      supplierId,
      productId,
      values: { ...readyValues("BLOCKED"), imageUrls: [] },
    });
    const error = await expectAppError(
      submitSupplierPanelProduct(database, { supplierId, productId }),
      "VALIDATION",
    );
    expect(String(error)).toContain("Corrija 1 pendência");
  });

  it("approves a product under review and clears it for resellers", async () => {
    const submitted = await readyInReview("FLOW-1");
    expect(submitted.reviewStatus).toBe("in_review");
    expect(submitted.submittedAt).not.toBeNull();
    const approved = await approveSupplierPanelProduct(database, {
      supplierId,
      productId: submitted.id,
      reviewerId: REVIEWER,
    });
    expect(approved).toMatchObject({
      reviewStatus: "approved",
      reviewedBy: REVIEWER,
      rejectionReasons: [],
    });
    await expectAppError(
      approveSupplierPanelProduct(database, {
        supplierId,
        productId: submitted.id,
        reviewerId: REVIEWER,
      }),
      "CONFLICT",
    );
  });

  it("keeps rejection reasons and turns the product back into a draft on edit", async () => {
    const submitted = await readyInReview("FLOW-2");
    const reasons = [{ field: "imageUrls", rule: "image_quality", message: "Imagem desfocada" }];
    await expectAppError(
      rejectSupplierPanelProduct(database, {
        supplierId,
        productId: submitted.id,
        reviewerId: REVIEWER,
        reasons: [],
      }),
      "VALIDATION",
    );
    const rejected = await rejectSupplierPanelProduct(database, {
      supplierId,
      productId: submitted.id,
      reviewerId: REVIEWER,
      reasons,
    });
    expect(rejected).toMatchObject({ reviewStatus: "rejected", rejectionReasons: reasons });
    const edited = await saveSupplierPanelDraft(database, {
      supplierId,
      productId: submitted.id,
      expectedUpdatedAt: rejected.updatedAt.toISOString(),
      values: { ...readyValues("FLOW-2"), imageUrls: ["https://imagens.test/nitida.jpg"] },
    });
    expect(edited).toMatchObject({ reviewStatus: "draft", rejectionReasons: reasons });
  });

  it("sends an approved product back to review on a title change, not on a stock change", async () => {
    const submitted = await readyInReview("FLOW-3");
    const approved = await approveSupplierPanelProduct(database, {
      supplierId,
      productId: submitted.id,
      reviewerId: REVIEWER,
    });
    const restocked = await saveSupplierPanelDraft(database, {
      supplierId,
      productId: approved.id,
      expectedUpdatedAt: approved.updatedAt.toISOString(),
      values: { ...readyValues("FLOW-3"), stock: 30, costCents: 2600 },
    });
    expect(restocked.reviewStatus).toBe("approved");
    const retitled = await saveSupplierPanelDraft(database, {
      supplierId,
      productId: approved.id,
      expectedUpdatedAt: restocked.updatedAt.toISOString(),
      values: {
        ...readyValues("FLOW-3"),
        stock: 30,
        costCents: 2600,
        title: "Camiseta nova - Branca",
      },
    });
    expect(retitled.reviewStatus).toBe("in_review");
  });
});

describe("listSupplierPanelProducts", () => {
  it("counts each status for the search and filters, sorts and pages the list", async () => {
    const all = await listSupplierPanelProducts(database, { ...LIST, supplierId });
    expect(all.counts.all).toBe(all.total);
    expect(all.counts.draft).toBeGreaterThan(0);
    const drafts = await listSupplierPanelProducts(database, {
      ...LIST,
      supplierId,
      status: "draft",
    });
    expect(drafts.items.every((item) => item.reviewStatus === "draft")).toBe(true);
    expect(drafts.total).toBe(all.counts.draft);
    const bySku = await listSupplierPanelProducts(database, {
      ...LIST,
      supplierId,
      sort: "sku",
      direction: "asc",
      pageSize: 10,
    });
    const skus = bySku.items.map((item) => item.sku);
    expect(skus).toEqual(skus.toSorted());
    const searched = await listSupplierPanelProducts(database, {
      ...LIST,
      supplierId,
      query: "flow-1",
    });
    expect(searched.items.map((item) => item.sku)).toEqual(["FLOW-1"]);
    expect(searched.counts).toMatchObject({ all: 1, approved: 1, draft: 0 });
    expect(searched.items[0]?.categoryName).toBe("Painel teste");
  });

  it("never lists another supplier's products and fails for an unknown supplier", async () => {
    const list = await listSupplierPanelProducts(database, {
      ...LIST,
      supplierId: otherSupplierId,
    });
    expect(list.items.map((item) => item.sku)).toEqual(["FOREIGN"]);
    await expectAppError(
      listSupplierPanelProducts(database, { ...LIST, supplierId: randomUUID() }),
      "NOT_FOUND",
    );
    await expectAppError(
      getSupplierPanelProduct(database, { supplierId, productId: randomUUID() }),
      "NOT_FOUND",
    );
  });
});
