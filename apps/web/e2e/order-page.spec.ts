import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { organization, orderItems, orders, storeConnections } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { forwardableProduct } from "./catalog-fixtures";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const externalId = `E2E-PAGE-${randomUUID()}`;
const deliveredId = `E2E-RATE-${randomUUID()}`;
const lateId = `E2E-LATE-${randomUUID()}`;
let orderId = "";
let deliveredOrderId = "";
let lateOrderId = "";

const DAY_MILLISECONDS = 86_400_000;

type SeedOrder = Pick<
  typeof orders.$inferInsert,
  "externalOrderId" | "status" | "buyerName" | "orderedAt" | "deliveredAt"
>;

/** One R$ 99,00 order of the demo tenant with a single item of a seeded product. */
async function insertOrder(order: SeedOrder): Promise<string> {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  if (!tenant) throw new Error("Seed demo missing");
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenant.id));
  const product = await forwardableProduct(database);
  if (!store || !product) throw new Error("Seed catalog missing");
  const [created] = await database
    .insert(orders)
    .values({
      ...order,
      tenantId: tenant.id,
      storeConnectionId: store.id,
      totalCents: 9900,
      marketplaceFeeCents: 1300,
    })
    .returning();
  if (!created) throw new Error("Order missing");
  await database.insert(orderItems).values({
    tenantId: tenant.id,
    orderId: created.id,
    supplierProductId: product.id,
    title: product.title,
    quantity: 1,
    unitPriceCents: 9900,
    unitCostCents: product.costCents,
  });
  return created.id;
}

test.beforeAll(async () => {
  orderId = await insertOrder({
    externalOrderId: externalId,
    status: "paid",
    buyerName: "Juliana Costa",
    orderedAt: new Date(),
  });
  // Delivered yesterday: its supplier can be rated from the order page.
  deliveredOrderId = await insertOrder({
    externalOrderId: deliveredId,
    status: "delivered",
    buyerName: "Renata Alves",
    orderedAt: new Date(Date.now() - 3 * DAY_MILLISECONDS),
    deliveredAt: new Date(Date.now() - DAY_MILLISECONDS),
  });
  // Delivered 70 days ago and never rated: the 60-day window is over.
  lateOrderId = await insertOrder({
    externalOrderId: lateId,
    status: "delivered",
    buyerName: "Paula Reis",
    orderedAt: new Date(Date.now() - 75 * DAY_MILLISECONDS),
    deliveredAt: new Date(Date.now() - 70 * DAY_MILLISECONDS),
  });
});

test.afterAll(async () => {
  if (orderId) await database.delete(orders).where(eq(orders.id, orderId));
  if (deliveredOrderId) await database.delete(orders).where(eq(orders.id, deliveredOrderId));
  if (lateOrderId) await database.delete(orders).where(eq(orders.id, lateOrderId));
  await database.$client.end();
});

test("opens an order from operations with its items, money, progress and shipping", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await expect(page).toHaveURL(/opQuery=/);
  await page.getByRole("link", { name: externalId }).click();

  await expect(page).toHaveURL(new RegExp(`/pedidos/${orderId}([?]|$)`));
  await expect(page.getByRole("heading", { level: 1, name: `Pedido ${externalId}` })).toBeVisible();
  await expect(page.getByText("Juliana Costa").first()).toBeVisible();
  const items = page.getByRole("region", { name: "Itens" });
  await expect(items.getByText("R$ 99,00", { exact: true })).toBeVisible();
  const money = page.getByRole("region", { name: "Dinheiro" });
  await expect(money.getByText("Receita")).toBeVisible();
  await expect(money.getByText("Lucro")).toBeVisible();
  await expect(page.getByRole("region", { name: "Andamento do pedido" })).toContainText("Pago");
  // Shipping is the same operation as the dialog: not forwarded yet, so the forward form.
  await expect(
    page.getByRole("button", { name: "Criar ordens e encaminhar aos fornecedores" }),
  ).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Pedidos", exact: true }).click();
  await expect(page).toHaveURL(/\/pedidos(\?|$)/);
});

test("says an unknown order does not exist", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos/${randomUUID()}`);
  await expect(page.getByText("Pedido não encontrado")).toBeVisible();
});

test("keeps the operations filters when coming back from an order", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.locator("label", { hasText: "7 dias" }).click();
  await expect(page).toHaveURL(/period=7d/);
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await expect(page).toHaveURL(/opQuery=/);
  await page.getByRole("link", { name: externalId }).click();
  await expect(page).toHaveURL(new RegExp(`/pedidos/${orderId}([?]|$)`));

  await page.getByRole("main").getByRole("link", { name: "Pedidos", exact: true }).click();
  await expect(page.getByLabel("Buscar por pedido ou comprador")).toHaveValue(externalId);
  await expect(page.getByRole("radio", { name: "7 dias" })).toBeChecked();
  await expect(page.getByRole("link", { name: externalId })).toBeVisible();
});

test("rates the supplier from inside a delivered order", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos/${deliveredOrderId}`);
  const rating = page.getByRole("region", { name: "Avaliação" });
  await rating.getByRole("button", { name: "Avaliar" }).click();
  const dialog = page.getByRole("dialog", { name: "Como foi o fornecedor neste pedido?" });
  await dialog.getByLabel("5 estrelas: Excelente").check();
  await dialog.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(dialog).toBeHidden();
  await expect(rating.getByText("5 de 5")).toBeVisible();
  const edit = rating.getByRole("button", { name: /^Editar avaliação/ });
  await expect(edit).toBeVisible();
  // "Avaliar" is gone: focus lands on its replacement, not at the top of the page.
  await expect(edit).toBeFocused();
});

test("says the review window is over for an order delivered long ago", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos/${lateOrderId}`);
  const rating = page.getByRole("region", { name: "Avaliação" });
  await expect(rating.getByText("Prazo de 60 dias encerrado")).toBeVisible();
  await expect(rating.getByRole("button", { name: "Avaliar" })).toHaveCount(0);
});

test("a page past the end of the operations list shows the last page, not an empty list", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos?opQuery=${externalId}&opPage=999`);
  await expect(page.getByRole("link", { name: externalId })).toBeVisible();
  await expect(page.getByText("Nenhum pedido encontrado")).toHaveCount(0);
});
