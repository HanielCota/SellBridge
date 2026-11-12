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
import { and, eq } from "drizzle-orm";
import { gotoHydrated } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const BUYER = `Rita Coleta ${randomUUID().slice(0, 6)}`;
const TRACKING = `MEL${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}BR`;
const orderIds: string[] = [];

test.afterAll(async () => {
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

/** A Mercado Livre sale ready to ship, with the pickup and the tracking Mercado Livre sent. */
async function readySale(supplierId: string, productId: string) {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  if (!tenant) throw new Error("Seed demo missing");
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(and(eq(storeConnections.tenantId, tenant.id), eq(storeConnections.manual, false)));
  if (!store || store.marketplace !== "mercado_livre") throw new Error("Seed ML store missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: `E2E-COLETA-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 9_900,
      buyerName: BUYER,
      orderedAt: new Date(),
    })
    .returning({ id: orders.id, externalOrderId: orders.externalOrderId });
  if (!order) throw new Error("Order missing");
  orderIds.push(order.id);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId: tenant.id,
      orderId: order.id,
      supplierProductId: productId,
      title: "Blusa coleta",
      quantity: 1,
      unitPriceCents: 9_900,
      unitCostCents: 4_000,
    })
    .returning({ id: orderItems.id });
  if (!item) throw new Error("Order item missing");
  await database.insert(orderShipments).values({
    tenantId: tenant.id,
    orderId: order.id,
    supplierId,
    status: "ready",
    carrier: "Mercado Envios",
    trackingCode: TRACKING,
    marketplaceLogisticType: "cross_docking",
    address: {
      recipient: BUYER,
      street: "Rua das Flores",
      number: "10",
      complement: "",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      postalCode: "01001-000",
    },
    items: [{ orderItemId: item.id, title: "Blusa coleta", sku: "BLU-COL", quantity: 1 }],
  });
  return order;
}

test("o fornecedor vê o canal e a forma de envio, e despacha sem digitar o rastreio do canal", async ({
  page,
}) => {
  const email = await accounts.signUp(page, "Ateliê Coleta E2E");
  const supplierId = await giveTestBrand(database, email, "Ateliê Coleta E2E");
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `COL-${randomUUID().slice(0, 8)}`,
      title: "Blusa coleta",
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 3,
    })
    .returning({ id: supplierProducts.id });
  if (!product) throw new Error("Product missing");
  const order = await readySale(supplierId, product.id);

  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${encodeURIComponent(BUYER)}`);
  const row = page
    .getByRole("button", { name: `Pedido ${order.externalOrderId}` })
    .filter({ visible: true });
  await expect(row).toBeVisible();
  const channel = page.getByText("Mercado Livre", { exact: true }).filter({ visible: true });
  await expect(channel).toBeVisible();
  await expect(page.getByText("Coleta", { exact: true }).filter({ visible: true })).toBeVisible();

  await row.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Forma de envio")).toBeVisible();
  await expect(dialog.getByText("Coleta: o Mercado Livre busca")).toBeVisible();
  await expect(dialog.getByLabel("Código de rastreio")).toHaveValue(TRACKING);
  const hint = dialog.getByText("Veio do Mercado Livre: confira e marque como enviado.");
  await expect(hint).toBeVisible();

  // A code the supplier types is theirs: the hint no longer says it came from the channel.
  await dialog.getByLabel("Código de rastreio").fill("BR123456789XX");
  await expect(hint).toBeHidden();
});
