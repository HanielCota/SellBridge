import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listings,
  productGroupings,
  productModels,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testStoreInput } from "../testing/fixtures.ts";
import { findTargetsNeedingSync } from "./listing-sync.ts";
import { createListingWithTargets, markTargetPublished } from "./listings.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import {
  findModelGrouping,
  groupProducts,
  listGroupingSuggestions,
  separateGroupedModel,
} from "./product-groupings.ts";
import { addCombinationsToModel } from "./product-models.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let supplierId = "";
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let storeId = "";

const fiscal = { ncm: "64039990", origin: 0, unit: "PAR" as const };

beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Juntar ${randomUUID()}`, niche: "Calçados", state: "SP", city: "Franca" })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("supplier not created");
  }
  supplierId = supplier.id;
  tenants = await createTestTenants(database, 1);
  storeId = (
    await upsertStoreConnection(database, {
      ...testStoreInput(tenants.ids[0] ?? "", randomUUID()),
      supplierId,
    })
  ).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

async function product(
  prefix: string,
  variant: { color: string; size: string },
  overrides: Partial<typeof supplierProducts.$inferInsert> = {},
) {
  const [row] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `${prefix}-${variant.color.slice(0, 3).toUpperCase()}-${variant.size}`,
      title: `Tênis ${prefix} - ${variant.color} ${variant.size}`,
      description: `Descrição do ${variant.color} ${variant.size}`,
      costCents: 5000,
      suggestedPriceCents: 9990,
      stock: 6,
      imageUrls: [`https://cdn.example.com/${prefix}-${variant.color}-${variant.size}.jpg`],
      mercadoLivreAttributes: { BRAND: "Pegada", GTIN: "7891234567895" },
      fiscal: { ...fiscal, netWeightGrams: 700 },
      fiscalRequired: true,
      reviewStatus: "approved",
      ...overrides,
    })
    .returning();
  if (row === undefined) {
    throw new Error("product not created");
  }
  return row;
}

async function rowOf(id: string) {
  const [row] = await database.select().from(supplierProducts).where(eq(supplierProducts.id, id));
  if (row === undefined) {
    throw new Error(`product ${id} not found`);
  }
  return row;
}

/** An old listing on the air, as a reseller published it before the grid existed. */
async function liveListing(productId: string) {
  const tenantId = tenants.ids[0] ?? "";
  const listing = await createListingWithTargets(
    database,
    tenantId,
    {
      supplierProductId: productId,
      title: "Tênis do revendedor",
      description: "Texto do revendedor",
      priceCents: 14990,
    },
    [storeId],
  );
  const targetId = listing.targetIds[0];
  if (targetId === undefined) {
    throw new Error("listing target not created");
  }
  const externalId = `MLB-${randomUUID()}`;
  await markTargetPublished(database, targetId, { externalId, externalUrl: null });
  return { tenantId, listingId: listing.listingId, targetId, externalId };
}

async function shoes(prefix: string) {
  return [
    await product(prefix, { color: "Preto", size: "38" }),
    await product(prefix, { color: "Preto", size: "39" }, { reservedStock: 2 }),
    await product(prefix, { color: "Branco", size: "38" }, { reviewStatus: "draft" }),
  ];
}

function groupInput(rows: readonly { id: string; title: string }[], main?: string) {
  return {
    supplierId,
    groupedBy: "user-test",
    modelTitle: `Tênis ${randomUUID().slice(0, 6)}`,
    mainProductId: main ?? rows[0]?.id ?? "",
    products: rows.map((row) => {
      const words = row.title.split(" - ")[1]?.split(" ") ?? [];
      const size = words.at(-1) ?? null;
      const color = words.length > 1 ? (words[0] ?? null) : null;
      return { productId: row.id, color, size };
    }),
  };
}

async function grouped(rows: readonly { id: string; title: string }[], main?: string) {
  const result = await groupProducts(database, groupInput(rows, main));
  if (!result.grouped) {
    throw new Error(`grouping refused: ${JSON.stringify(result.problems)}`);
  }
  return result;
}

describe("groupProducts", () => {
  it("keeps each product's id, status, stock and reservation, and rewrites only the shared data", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = await shoes(prefix);
    const before = await Promise.all(rows.map(async (row) => await rowOf(row.id)));

    const { modelId } = await grouped(rows);

    const after = await Promise.all(rows.map(async (row) => await rowOf(row.id)));
    for (const [index, row] of after.entries()) {
      const old = before[index];
      expect(row).toMatchObject({
        modelId,
        sku: old?.sku,
        stock: old?.stock,
        reservedStock: old?.reservedStock,
        costCents: old?.costCents,
        suggestedPriceCents: old?.suggestedPriceCents,
        reviewStatus: old?.reviewStatus,
        active: old?.active,
        description: before[0]?.description,
      });
    }
    expect(after[1]).toMatchObject({
      color: "Preto",
      size: "39",
      variantAttributes: { GTIN: "7891234567895" },
      variantFiscal: { netWeightGrams: 700 },
    });
    expect(after[1]?.title).toMatch(/ - Preto 39$/);
    expect(after[1]?.imageUrls).toEqual([
      `https://cdn.example.com/${prefix}-Preto-38.jpg`,
      `https://cdn.example.com/${prefix}-Preto-39.jpg`,
    ]);
    expect(after[2]?.reviewStatus).toBe("draft");
  });

  it("keeps barcode, colour and size out of the model's shared sheet", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = await shoes(prefix);
    await database
      .update(supplierProducts)
      .set({
        mercadoLivreAttributes: {
          BRAND: "Pegada",
          GTIN: "7891234567895",
          COLOR: "Preto",
          SIZE: "38",
        },
      })
      .where(eq(supplierProducts.id, rows[0]?.id ?? ""));

    const { modelId } = await grouped(rows);

    const [model] = await database
      .select({ attributes: productModels.mercadoLivreAttributes })
      .from(productModels)
      .where(eq(productModels.id, modelId));
    expect(model?.attributes).toEqual({ BRAND: "Pegada" });
  });

  it("refuses a product whose NCM differs from the main product's, writing nothing", async () => {
    const prefix = randomUUID().slice(0, 6);
    const first = await product(prefix, { color: "Preto", size: "38" });
    const other = await product(
      prefix,
      { color: "Preto", size: "39" },
      { fiscal: { ...fiscal, ncm: "64029990" } },
    );

    const result = await groupProducts(database, groupInput([first, other]));

    expect(result.grouped).toBe(false);
    expect(result.grouped ? [] : result.problems.byProduct[other.id]).toEqual([
      "NCM diferente do produto principal (6402.99.90 aqui, 6403.99.90 no principal). Corrija este produto antes de juntar.",
    ]);
    expect((await rowOf(other.id)).modelId).toBeNull();
  });

  it("keeps an approved product approved when it lacks NCM like the rest of the group", async () => {
    const prefix = randomUUID().slice(0, 6);
    const main = await product(prefix, { color: "Preto", size: "38" }, { fiscal: {} });
    const legacy = await product(prefix, { color: "Preto", size: "39" }, { fiscal: {} });

    await grouped([main, legacy]);

    expect((await rowOf(legacy.id)).reviewStatus).toBe("approved");
  });

  it("refuses a group that would take an approved product off sale, naming it", async () => {
    const prefix = randomUUID().slice(0, 6);
    const bare = await product(
      prefix,
      { color: "Preto", size: "38" },
      { title: `Tênis ${prefix} - 38`, imageUrls: [], reviewStatus: "draft" },
    );
    const approved = await product(
      prefix,
      { color: "Preto", size: "39" },
      { title: `Tênis ${prefix} - 39` },
    );

    const result = await groupProducts(database, groupInput([bare, approved]));

    expect(result.grouped).toBe(false);
    const problems = result.grouped ? undefined : result.problems.byProduct[approved.id];
    expect(problems).toEqual([
      "Juntar tiraria este produto de venda (Adicione pelo menos 1 imagem). Escolha outro produto principal ou complete o principal antes.",
    ]);
    expect(await rowOf(approved.id)).toMatchObject({ modelId: null, reviewStatus: "approved" });
  });

  it("refuses a product already in a grid", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = await shoes(prefix);
    await grouped(rows.slice(0, 2));

    const attempt = groupProducts(
      database,
      groupInput([rows[1], rows[2]].filter((row) => row !== undefined)),
    );

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "CONFLICT"));
  });

  it("refuses a product of another supplier", async () => {
    const prefix = randomUUID().slice(0, 6);
    const [mine] = await shoes(prefix);
    const [other] = await database
      .insert(suppliers)
      .values({ name: `Outro ${prefix}`, niche: "Calçados", state: "SP", city: "Franca" })
      .returning({ id: suppliers.id });
    const [foreign] = await database
      .insert(supplierProducts)
      .values({
        supplierId: other?.id ?? "",
        sku: `${prefix}-X`,
        title: `Tênis ${prefix} - Azul 40`,
        costCents: 1,
        suggestedPriceCents: 1,
      })
      .returning();

    const attempt = groupProducts(
      database,
      groupInput([mine, foreign].filter((row) => row !== undefined)),
    );

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "NOT_FOUND"));
    await database.delete(suppliers).where(eq(suppliers.id, other?.id ?? ""));
  });
});

describe("old listings and orders after grouping", () => {
  it("keeps the old listing's own title and syncs the combination's stock", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = await shoes(prefix);
    const black39 = rows[1];
    if (black39 === undefined) throw new Error("missing product");
    const old = await liveListing(black39.id);
    await grouped(rows);

    await database
      .update(supplierProducts)
      .set({ stock: 9 })
      .where(eq(supplierProducts.id, black39.id));

    const [listing] = await database
      .select({ title: listings.title, productId: listings.supplierProductId })
      .from(listings)
      .where(eq(listings.id, old.listingId));
    expect(listing).toEqual({ title: "Tênis do revendedor", productId: black39.id });
    const sync = (await findTargetsNeedingSync(database, 10_000)).find(
      (target) => target.targetId === old.targetId,
    );
    expect(sync?.stock).toBe(9 - 2);
  });

  it("reserves the right combination for a new order from an old listing", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = await shoes(prefix);
    const black38 = rows[0];
    if (black38 === undefined) throw new Error("missing product");
    const old = await liveListing(black38.id);
    await grouped(rows);

    await upsertMarketplaceOrder(database, old.tenantId, storeId, {
      externalOrderId: `ORDER-${prefix}`,
      status: "paid",
      totalCents: 14990,
      marketplaceFeeCents: 0,
      buyerName: null,
      orderedAt: new Date("2026-11-20T12:00:00Z"),
      items: [
        { externalListingId: old.externalId, title: "Tênis", quantity: 1, unitPriceCents: 14990 },
      ],
    });

    expect((await rowOf(black38.id)).reservedStock).toBe(1);
    expect((await rowOf(rows[1]?.id ?? "")).reservedStock).toBe(2);
  });
});

describe("separateGroupedModel", () => {
  it("restores each product's exact before and keeps stock and prices changed since", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = await shoes(prefix);
    const before = await Promise.all(rows.map(async (row) => await rowOf(row.id)));
    const { modelId, groupingId } = await grouped(rows);
    await database
      .update(supplierProducts)
      .set({ stock: 1, costCents: 4200 })
      .where(eq(supplierProducts.id, rows[0]?.id ?? ""));

    await separateGroupedModel(database, { supplierId, modelId, separatedBy: "user-test" });

    const after = await Promise.all(rows.map(async (row) => await rowOf(row.id)));
    for (const [index, row] of after.entries()) {
      const { updatedAt: _after, stock: _stock, costCents: _cost, ...restored } = row;
      const {
        updatedAt: _before,
        stock: _oldStock,
        costCents: _oldCost,
        ...original
      } = before[index] ?? row;
      expect(restored).toEqual(original);
    }
    expect(after[0]).toMatchObject({ stock: 1, costCents: 4200 });
    const models = await database.select().from(productModels).where(eq(productModels.id, modelId));
    expect(models).toEqual([]);
    const [trail] = await database
      .select()
      .from(productGroupings)
      .where(eq(productGroupings.id, groupingId));
    expect(trail).toMatchObject({ modelId: null, separatedBy: "user-test" });
  });

  it("turns a combination added after grouping into a plain product named by the grid", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = await shoes(prefix);
    const input = groupInput(rows);
    const result = await groupProducts(database, input);
    if (!result.grouped) throw new Error("grouping refused");
    const [added] = await database.transaction(
      async (transaction) =>
        await addCombinationsToModel(transaction, {
          supplierId,
          modelId: result.modelId,
          colors: [],
          sizes: ["40"],
          combinations: [
            {
              color: "Preto",
              size: "40",
              sku: `${prefix}-PRE-40`,
              gtin: null,
              costCents: 5000,
              suggestedPriceCents: 9990,
              stock: 3,
              netWeightGrams: null,
            },
          ],
        }),
    );

    await separateGroupedModel(database, {
      supplierId,
      modelId: result.modelId,
      separatedBy: "user-test",
    });

    expect(await rowOf(added ?? "")).toMatchObject({
      modelId: null,
      color: null,
      size: null,
      title: `${input.modelTitle} - Preto 40`,
      stock: 3,
    });
  });

  it("refuses a grid that did not come from grouping", async () => {
    const [model] = await database
      .insert(productModels)
      .values({ supplierId, code: `FORM-${randomUUID()}`, title: "Grade do formulário" })
      .returning({ id: productModels.id });

    const attempt = separateGroupedModel(database, {
      supplierId,
      modelId: model?.id ?? "",
      separatedBy: "user-test",
    });

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "VALIDATION"));
    expect(await findModelGrouping(database, { supplierId, modelId: model?.id ?? "" })).toBeNull();
  });
});

describe("listGroupingSuggestions", () => {
  it("suggests the products outside a grid with their live listings", async () => {
    const prefix = randomUUID().slice(0, 6);
    const rows = await shoes(prefix);
    await liveListing(rows[0]?.id ?? "");

    const suggestions = await listGroupingSuggestions(database, supplierId);

    const mine = suggestions.find((suggestion) => suggestion.modelTitle === `Tênis ${prefix}`);
    expect(mine?.products.map((entry) => [entry.sku, entry.liveListings])).toEqual([
      [`${prefix}-BRA-38`, 0],
      [`${prefix}-PRE-38`, 1],
      [`${prefix}-PRE-39`, 0],
    ]);
    await grouped(rows);
    const after = await listGroupingSuggestions(database, supplierId);
    expect(after.some((suggestion) => suggestion.modelTitle === `Tênis ${prefix}`)).toBe(false);
  });
});
