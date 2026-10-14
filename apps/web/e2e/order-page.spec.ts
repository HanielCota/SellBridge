import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import {
  organization,
  orderItems,
  orders,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const externalId = `E2E-PAGE-${randomUUID()}`;
let orderId = "";

test.beforeAll(async () => {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  if (!tenant) throw new Error("Seed demo missing");
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenant.id));
  const [product] = await database.select().from(supplierProducts).limit(1);
  if (!store || !product) throw new Error("Seed catalog missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: externalId,
      status: "paid",
      totalCents: 9900,
      marketplaceFeeCents: 1300,
      buyerName: "Juliana Costa",
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("Order missing");
  orderId = order.id;
  await database.insert(orderItems).values({
    tenantId: tenant.id,
    orderId,
    supplierProductId: product.id,
    title: product.title,
    quantity: 1,
    unitPriceCents: 9900,
    unitCostCents: product.costCents,
  });
});

test.afterAll(async () => {
  if (orderId) await database.delete(orders).where(eq(orders.id, orderId));
  await database.$client.end();
});

test("opens an order from operations with its items, money, progress and shipping", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("link", { name: externalId }).click();

  await expect(page).toHaveURL(new RegExp(`/pedidos/${orderId}$`));
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
  await page.getByRole("link", { name: "Pedidos" }).first().click();
  await expect(page).toHaveURL(/\/pedidos(\?|$)/);
});

test("says an order of another account does not exist", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos/${randomUUID()}`);
  await expect(page.getByText("Pedido não encontrado")).toBeVisible();
});
