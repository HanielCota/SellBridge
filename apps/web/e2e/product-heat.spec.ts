import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { orderItems, orders } from "@sellbridge/database/schema";
import { ownSellableListing } from "./catalog-fixtures";
import { e2eDatabase } from "./database";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = e2eDatabase();
const UNITS_SOLD = 25;
let listing: Awaited<ReturnType<typeof ownSellableListing>> | undefined;

test.beforeAll(async () => {
  listing = await ownSellableListing(database, DEMO_USER.email);
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: listing.tenantId,
      storeConnectionId: listing.storeId,
      externalOrderId: `heat-e2e-${randomUUID()}`,
      status: "paid",
      totalCents: 4990 * UNITS_SOLD,
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("pedido de teste não criado");
  await database.insert(orderItems).values({
    tenantId: listing.tenantId,
    orderId: order.id,
    supplierProductId: listing.productId,
    title: listing.title,
    quantity: UNITS_SOLD,
    unitPriceCents: 4990,
    unitCostCents: 2000,
    // Already counted: the stock reservation job has nothing to take for this seeded sale.
    stockState: "untracked",
  });
});

test.afterAll(async () => {
  await listing?.remove();
  await database.$client.end();
});

test("o catálogo e a tela do produto mostram a temperatura com as vendas", async ({ page }) => {
  if (listing === undefined) throw new Error("anúncio de teste não criado");
  const { title, storeId, productId } = listing;
  await signIn(page, DEMO_USER);

  await gotoHydrated(page, `/catalogo?store=${storeId}&query=${encodeURIComponent(title)}`);
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
  await expect(card.getByText("Quente", { exact: true })).toBeVisible();
  await expect(card.getByText(`${UNITS_SOLD} vendas em 30 dias`, { exact: true })).toBeVisible();

  await gotoHydrated(page, `/publicacoes/nova?productId=${productId}`);
  await expect(page.getByText("Quente", { exact: true })).toBeVisible();
  await expect(
    page.getByText(`${UNITS_SOLD} vendas em 30 dias no SellBridge`, { exact: true }),
  ).toBeVisible();
});
