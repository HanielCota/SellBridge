import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { supplierProducts } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ownSellableListing } from "./catalog-fixtures";
import { e2eDatabase } from "./database";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = e2eDatabase();
let listing: Awaited<ReturnType<typeof ownSellableListing>> | undefined;
const stamp = randomUUID().slice(0, 6);
// Named so the sold-out card sits beside the published listing ("Luminária ...") on a phone.
const SOLD_OUT_TITLE = `Abajur esgotado ${stamp}`;
const TO_PUBLISH_TITLE = `Bule para publicar ${stamp}`;

async function addProduct(supplierId: string, title: string, stock: number): Promise<void> {
  await database.insert(supplierProducts).values({
    supplierId,
    sku: `FOOTER-E2E-${randomUUID().slice(0, 8)}`,
    title,
    costCents: 2000,
    suggestedPriceCents: 4990,
    stock,
  });
}

test.beforeAll(async () => {
  listing = await ownSellableListing(database, DEMO_USER.email);
  const [product] = await database
    .select({ supplierId: supplierProducts.supplierId })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, listing.productId));
  if (product === undefined) throw new Error("fornecedor de teste não encontrado");
  await addProduct(product.supplierId, SOLD_OUT_TITLE, 0);
  await addProduct(product.supplierId, TO_PUBLISH_TITLE, 20);
});

test.afterAll(async () => {
  await listing?.remove();
  await database.$client.end();
});

test("o rodapé de estoque começa na mesma altura em todos os cartões da linha", async ({
  page,
}) => {
  if (listing === undefined) throw new Error("anúncio de teste não criado");
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, DEMO_USER);

  await gotoHydrated(page, `/catalogo?store=${listing.storeId}&sort=title`);
  await expect(page.locator("article").getByRole("heading")).toHaveText([
    SOLD_OUT_TITLE,
    TO_PUBLISH_TITLE,
    listing.title,
  ]);
  const footerTopsByRow = await page.locator("article").evaluateAll((cards) => {
    const rows = new Map<number, number[]>();
    for (const card of cards) {
      const cardTop = Math.round(card.getBoundingClientRect().top);
      const footer = card.lastElementChild;
      if (footer === null) continue;
      const row = rows.get(cardTop) ?? [];
      row.push(Math.round(footer.getBoundingClientRect().top));
      rows.set(cardTop, row);
    }
    return [...rows.values()];
  });

  expect(footerTopsByRow[0]).toHaveLength(2);
  for (const tops of footerTopsByRow) {
    expect(new Set(tops).size).toBe(1);
  }
});
