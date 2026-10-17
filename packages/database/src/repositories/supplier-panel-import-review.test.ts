import { randomUUID } from "node:crypto";
import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { importSupplierProducts, saveAdminSupplier } from "./admin-suppliers.ts";

/**
 * A spreadsheet the supplier sends through the panel goes through the same review as the panel
 * form: it must never publish a product to resellers on its own (found testing PR #44, where
 * the supplier import reused the admin import and saved every row as approved).
 */
const database = createTestDatabase();
const REVIEWED_AT = new Date("2026-10-16T12:00:00Z");
const HEADER = "sku;titulo;custo;estoque;imagens;categoria";
const categorySlug = `importacao-revisao-${randomUUID().slice(0, 8)}`;
let supplierId = "";

async function importCsv(lines: readonly string[], reviewAt?: Date) {
  return await importSupplierProducts(database, {
    supplierId,
    rows: parseProductCsv([HEADER, ...lines.map((line) => `${line};${categorySlug}`)].join("\n"))
      .rows,
    validatePreview: () => undefined,
    ...(reviewAt === undefined ? {} : { reviewAt }),
  });
}

async function statusOf(sku: string) {
  const [row] = await database
    .select({ status: supplierProducts.reviewStatus, submittedAt: supplierProducts.submittedAt })
    .from(supplierProducts)
    .where(eq(supplierProducts.sku, sku));
  return row;
}

beforeAll(async () => {
  const supplier = await saveAdminSupplier(database, {
    name: `Importação revisão ${randomUUID()}`,
    niche: "Teste",
    description: "",
    state: "SP",
    city: "Campinas",
    logoUrl: null,
    contactEmail: null,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
  });
  supplierId = supplier.id;
  await database.insert(categories).values({ name: "Importação revisão", slug: categorySlug });
});

// Products go with their supplier; leftovers would sit in the shared review queue of later runs.
afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.delete(categories).where(eq(categories.slug, categorySlug));
});

describe("supplier spreadsheet import review", () => {
  it("sends new products to review, or keeps them as drafts when something blocks publishing", async () => {
    const ready = `REV-READY-${randomUUID().slice(0, 6)}`;
    const blocked = `REV-BLOCK-${randomUUID().slice(0, 6)}`;
    await importCsv(
      [
        `${ready};Coleira refletiva para cães;12,50;40;https://imagens.test/coleira.jpg`,
        `${blocked};Arranhador poste sisal médio;30,00;10;`,
      ],
      REVIEWED_AT,
    );
    expect(await statusOf(ready)).toEqual({ status: "in_review", submittedAt: REVIEWED_AT });
    expect(await statusOf(blocked)).toEqual({ status: "draft", submittedAt: null });
  });

  it("sends an approved product back to review only when what buyers see changes", async () => {
    const sku = `REV-LIVE-${randomUUID().slice(0, 6)}`;
    const image = "https://imagens.test/bebedouro.jpg";
    await importCsv([`${sku};Bebedouro fonte para gatos;45,90;25;${image}`]);
    expect((await statusOf(sku))?.status).toBe("approved");

    await importCsv([`${sku};Bebedouro fonte para gatos;47,00;30;${image}`], REVIEWED_AT);
    expect((await statusOf(sku))?.status).toBe("approved");

    await importCsv([`${sku};Bebedouro fonte gatos 2 litros;47,00;30;${image}`], REVIEWED_AT);
    expect(await statusOf(sku)).toEqual({ status: "in_review", submittedAt: REVIEWED_AT });
  });

  it("keeps the admin import approving what it writes", async () => {
    const sku = `REV-ADMIN-${randomUUID().slice(0, 6)}`;
    await importCsv([`${sku};Comedouro duplo inox;20,00;8;`]);
    expect((await statusOf(sku))?.status).toBe("approved");
  });
});
