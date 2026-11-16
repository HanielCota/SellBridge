import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { orderItems, orders, supplierProducts } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ownSellableListing } from "./catalog-fixtures";
import { e2eDatabase } from "./database";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = e2eDatabase();
let listing: Awaited<ReturnType<typeof ownSellableListing>> | undefined;
const stamp = randomUUID().slice(0, 6);
const UNSOLD_TITLE = `Abajur sem venda ${stamp}`;
const LESS_SOLD_TITLE = `Vaso pouco vendido ${stamp}`;

async function addProduct(supplierId: string, title: string): Promise<string> {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `BEST-E2E-${randomUUID().slice(0, 8)}`,
      title,
      costCents: 2000,
      suggestedPriceCents: 4990,
      stock: 20,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) throw new Error("produto de teste não criado");
  return product.id;
}

async function sell(productId: string, title: string, quantity: number): Promise<void> {
  if (listing === undefined) throw new Error("anúncio de teste não criado");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: listing.tenantId,
      storeConnectionId: listing.storeId,
      externalOrderId: `best-e2e-${randomUUID()}`,
      status: "paid",
      totalCents: 4990 * quantity,
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("pedido de teste não criado");
  await database.insert(orderItems).values({
    tenantId: listing.tenantId,
    orderId: order.id,
    supplierProductId: productId,
    title,
    quantity,
    unitPriceCents: 4990,
    unitCostCents: 2000,
    // Already counted: the stock reservation job has nothing to take for this seeded sale.
    stockState: "untracked",
  });
}

test.beforeAll(async () => {
  listing = await ownSellableListing(database, DEMO_USER.email);
  const [product] = await database
    .select({ supplierId: supplierProducts.supplierId })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, listing.productId));
  if (product === undefined) throw new Error("fornecedor de teste não encontrado");
  await addProduct(product.supplierId, UNSOLD_TITLE);
  const lessSoldId = await addProduct(product.supplierId, LESS_SOLD_TITLE);
  await sell(listing.productId, listing.title, 30);
  await sell(lessSoldId, LESS_SOLD_TITLE, 4);
});

test.afterAll(async () => {
  await listing?.remove();
  await database.$client.end();
});

test("o catálogo abre com os mais vendidos primeiro e troca a ordem pelo menu", async ({
  page,
}) => {
  if (listing === undefined) throw new Error("anúncio de teste não criado");
  await signIn(page, DEMO_USER);
  const cardTitles = page.locator("article").getByRole("heading");

  await gotoHydrated(page, `/catalogo?store=${listing.storeId}`);

  await expect(page.getByRole("combobox", { name: "Ordenar" })).toHaveText("Mais vendidos");
  await expect(cardTitles).toHaveText([listing.title, LESS_SOLD_TITLE, UNSOLD_TITLE]);

  await page.getByRole("combobox", { name: "Ordenar" }).click();
  await page.getByRole("option", { name: "Nome (A–Z)" }).click();

  await expect(page).toHaveURL(/sort=title/);
  await expect(cardTitles).toHaveText([UNSOLD_TITLE, listing.title, LESS_SOLD_TITLE]);
});
