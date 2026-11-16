import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  shipmentInvoices,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const RUN = randomUUID().slice(0, 6);
const PROBLEM =
  "Falta o NCM do produto NOTA-PARADA. Preencha em Produtos e peça para tentar de novo.";
const orderIds: string[] = [];

test.afterAll(async () => {
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

async function demoReseller() {
  const [tenant] = await database
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  if (tenant === undefined) throw new Error("Seed reseller missing");
  const [store] = await database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(and(eq(storeConnections.tenantId, tenant.id), eq(storeConnections.manual, false)));
  if (store === undefined) throw new Error("Seed store missing");
  return { tenantId: tenant.id, storeId: store.id };
}

/** A sale of the demo reseller, packed at the supplier, whose note stopped in the ERP. */
async function packedSaleWithStoppedNote(supplierId: string, productId: string) {
  const reseller = await demoReseller();
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: reseller.tenantId,
      storeConnectionId: reseller.storeId,
      externalOrderId: `E2E-NOTA-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 9_900,
      buyerName: "Juliana Costa",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id, externalOrderId: orders.externalOrderId });
  if (order === undefined) throw new Error("Order missing");
  orderIds.push(order.id);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId: reseller.tenantId,
      orderId: order.id,
      supplierProductId: productId,
      title: "Chinelo nota parada",
      quantity: 1,
      unitPriceCents: 9_900,
      unitCostCents: 4_000,
    })
    .returning({ id: orderItems.id });
  if (item === undefined) throw new Error("Order item missing");
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: reseller.tenantId,
      orderId: order.id,
      supplierId,
      status: "ready",
      address: {
        recipient: "Juliana Costa",
        street: "Rua das Flores",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01001-000",
      },
      items: [
        { orderItemId: item.id, title: "Chinelo nota parada", sku: "NOTA-PARADA", quantity: 1 },
      ],
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) throw new Error("Shipment missing");
  await database.insert(shipmentInvoices).values({
    shipmentId: shipment.id,
    supplierId,
    provider: "bling",
    status: "attention",
    problem: PROBLEM,
  });
  return { orderId: order.id, externalOrderId: order.externalOrderId };
}

function orderRow(page: Page, externalOrderId: string) {
  return page.getByRole("button", { name: `Pedido ${externalOrderId}` }).filter({ visible: true });
}

test("a nota parada aparece para o fornecedor em Com problema e para o revendedor sem o motivo", async ({
  page,
  browser,
}) => {
  const email = await accounts.signUp(page, `Ateliê Nota ${RUN}`);
  const supplierId = await giveTestBrand(database, email, `Ateliê Nota ${RUN}`);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `NOTA-${randomUUID().slice(0, 8)}`,
      title: "Chinelo nota parada",
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 5,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) throw new Error("Product missing");
  const sale = await packedSaleWithStoppedNote(supplierId, product.id);

  await gotoHydrated(page, "/fornecedor/painel");
  await page.getByRole("link", { name: /1 nota fiscal com problema/ }).click();
  await expect(page).toHaveURL(/tab=problem/);
  await expect(page.getByText("Nota fiscal com problema").filter({ visible: true })).toBeVisible();

  await orderRow(page, sale.externalOrderId).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(PROBLEM)).toBeVisible();
  await expect(dialog.getByText("A nota fiscal deste pedido está com problema")).toBeVisible();
  await expect(dialog.getByRole("listitem").filter({ hasText: "Nota emitida" })).toHaveText(
    "Nota emitidaAinda não",
  );

  const resellerContext = await browser.newContext();
  const resellerPage = await resellerContext.newPage();
  await signIn(resellerPage, DEMO_USER);
  await gotoHydrated(resellerPage, `/pedidos/${sale.orderId}`);
  const note = resellerPage.getByRole("region", { name: "Nota fiscal" });
  await expect(note.getByText(/^Nota com problema · /)).toBeVisible();
  await expect(note.getByText(/Ele já foi avisado/)).toBeVisible();
  await expect(note.getByText(PROBLEM)).toBeHidden();
  await resellerContext.close();
});
