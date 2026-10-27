import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { gotoHydrated } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const PRODUCT = `Vestido midi e2e ${randomUUID().slice(0, 8)}`;
const orderIds: string[] = [];

test.afterAll(async () => {
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

/** A paid sale of the demo reseller today: 2 dresses at R$ 40, waiting for the accept. */
async function sellToday(supplierId: string, productId: string): Promise<void> {
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
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: `E2E-FORNECEDOR-${randomUUID()}`,
      status: "paid",
      totalCents: 19_800,
      buyerName: "Paula Ribeiro",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (!order) throw new Error("Order missing");
  orderIds.push(order.id);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId: tenant.id,
      orderId: order.id,
      supplierProductId: productId,
      title: "Título do anúncio do revendedor",
      quantity: 2,
      unitPriceCents: 9_900,
      unitCostCents: 4_000,
    })
    .returning({ id: orderItems.id });
  if (!item) throw new Error("Order item missing");
  await database.insert(orderShipments).values({
    tenantId: tenant.id,
    orderId: order.id,
    supplierId,
    status: "forwarded",
    address: {
      recipient: "Paula Ribeiro",
      street: "Rua das Flores",
      number: "10",
      complement: "",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      postalCode: "01001-000",
    },
    items: [{ orderItemId: item.id, title: PRODUCT, sku: "VES-E2E", quantity: 2 }],
  });
}

test("o Início do fornecedor mostra vendas, mais vendidos e o que precisa dele", async ({
  page,
}) => {
  const email = await accounts.signUp(page, "Ateliê Vendas E2E");
  const supplierId = await giveTestBrand(database, email, "Ateliê Vendas E2E");
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `VES-${randomUUID().slice(0, 8)}`,
      title: PRODUCT,
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 6,
    })
    .returning({ id: supplierProducts.id });
  if (!product) throw new Error("Product missing");
  await sellToday(supplierId, product.id);

  await gotoHydrated(page, "/fornecedor/painel?period=7d");
  await expect(page.getByRole("heading", { name: "Painel do fornecedor", level: 1 })).toBeVisible();
  await expect(page.getByText(/Suas primeiras vendas chegaram: R\$\s80 a receber/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver a receber nos pedidos" })).toContainText("80");

  const best = page.getByRole("list", { name: "Produtos mais vendidos no período" });
  await expect(best.getByText(PRODUCT)).toBeVisible();
  await expect(best.getByText("2 peças")).toBeVisible();
  await expect(page.getByRole("link", { name: /1 pedido para aceitar/ })).toBeVisible();

  // The reseller's store, buyer and sale price never reach the supplier's spreadsheet.
  const exportHref = await page
    .getByRole("link", { name: "Exportar CSV do período" })
    .first()
    .getAttribute("href");
  const csv = await (await page.request.get(exportHref ?? "")).text();
  expect(csv).toContain(PRODUCT);
  expect(csv).toContain("80,00");
  expect(csv).not.toContain("Paula Ribeiro");
  expect(csv).not.toContain("99,00");

  await page.getByRole("combobox", { name: "Situação dos pedidos" }).click();
  await page.getByRole("option", { name: "Cancelados e devolvidos" }).click();
  await expect(page).toHaveURL(/situation=lost/);
  await expect(page.getByText("Nenhuma venda no período.").first()).toBeVisible();
});
