import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { organization, orderItems, orders, storeConnections } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const externalId = `E2E-PENDENTE-${randomUUID()}`;
let orderId = "";

/**
 * A paid sale of a listing created outside SellBridge: its item has no catalog product, so its
 * cost is unknown. The demo tenant sells it today, inside every period the screens open with.
 */
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
  if (!store) throw new Error("Seed store missing");
  const [created] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: externalId,
      status: "paid",
      totalCents: 12_000,
      marketplaceFeeCents: 1_600,
      buyerName: "Paula Ribeiro",
      orderedAt: new Date(),
    })
    .returning();
  if (!created) throw new Error("Order missing");
  orderId = created.id;
  await database.insert(orderItems).values({
    tenantId: tenant.id,
    orderId,
    title: "Luminária de fora da SellBridge",
    quantity: 1,
    unitPriceCents: 12_000,
    unitCostCents: 0,
  });
});

test.afterAll(async () => {
  if (orderId) await database.delete(orders).where(eq(orders.id, orderId));
  await database.$client.end();
});

test("financeiro deixa a venda de custo desconhecido fora do lucro e explica", async ({ page }) => {
  // Other sales of unknown cost may share the period (sale-resilience.spec leaves its own), so
  // the sentence is checked by its shape and this order by its row.
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/financeiro?period=7d&query=${externalId}`);
  await expect(
    page.getByText(/R\$\s[\d.,]+ de \d+ vendas? ainda não t[eê]m custo e fic/),
  ).toBeVisible();

  const statement = page.getByLabel("Financeiro por pedido");
  await expect(statement.getByText("Custo pendente").first()).toBeVisible();
  await expect(statement.getByText(/de R\$\s120,00 · fora do lucro/).first()).toBeVisible();

  await statement.getByRole("button", { name: new RegExp(externalId) }).click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("custo pendente", { exact: true })).toBeVisible();
});

test("painel tira a venda de custo desconhecido da margem e avisa", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/dashboard?period=7d");
  await expect(page.getByText(/R\$\s[\d.,]+ em \d+ vendas? com custo pendente fic/)).toBeVisible();
});

test("página do pedido diz que o custo do item é desconhecido", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos/${orderId}`);
  await expect(page.getByText(/1 × R\$\s120,00 · custo pendente/)).toBeVisible();
  await expect(page.getByText("fora do lucro", { exact: true })).toBeVisible();
});
