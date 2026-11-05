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
const BUYER = `Paula Conferência ${randomUUID().slice(0, 6)}`;
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

/** An accepted sale of the demo reseller: 2 pieces at R$ 40 for the supplier, with its tracking. */
async function acceptedSale(supplierId: string, productId: string) {
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
      externalOrderId: `E2E-CONFERIR-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 19_800,
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
      title: "Vestido conferência",
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
    status: "accepted",
    carrier: "Mercado Envios",
    trackingCode: TRACKING,
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
    items: [{ orderItemId: item.id, title: "Vestido conferência", sku: "VES-CONF", quantity: 2 }],
  });
  return { order, storeName: store.shopName };
}

test("o fornecedor acha o pedido pelo cliente, vê o que recebe e confere com o leitor", async ({
  page,
}) => {
  const email = await accounts.signUp(page, "Ateliê Conferência E2E");
  const supplierId = await giveTestBrand(database, email, "Ateliê Conferência E2E");
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `CONF-${randomUUID().slice(0, 8)}`,
      title: "Vestido conferência",
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 6,
    })
    .returning({ id: supplierProducts.id });
  if (!product) throw new Error("Product missing");
  const { order, storeName } = await acceptedSale(supplierId, product.id);

  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${encodeURIComponent(BUYER)}`);
  const row = page
    .getByRole("button", { name: `Pedido ${order.externalOrderId}` })
    .filter({ visible: true });
  await expect(row).toBeVisible();
  await expect(page.getByText(`${storeName} · ${BUYER}`).filter({ visible: true })).toBeVisible();
  await row.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Você recebe")).toBeVisible();
  await expect(dialog.getByText(/R\$\s80,00/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Conferir com leitor" }).click();
  const field = page.getByLabel("Código do pedido ou do rastreio");
  await expect(field).toBeFocused();
  await field.fill(order.externalOrderId.toLowerCase());
  await field.press("Enter");
  const log = page.getByRole("list", { name: "Pacotes lidos" });
  await expect(log).toContainText(`Pedido ${order.externalOrderId}: Pronto para envio.`);

  await page.getByText("Despacho", { exact: true }).click();
  // The reader may type the code with spaces or dashes; it still finds the parcel.
  await field.fill(`${TRACKING.slice(0, 5)}-${TRACKING.slice(5)}`);
  await field.press("Enter");
  await expect(log).toContainText(`Pedido ${order.externalOrderId}: Enviado.`);
});
