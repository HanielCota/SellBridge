import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  shipmentInvoices,
  shipmentResellerInvoices,
  storeConnections,
  supplierErpConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

// Venda à ordem: the supplier turns it on in Marca, and both sides see the notes on the order.
const database = e2eDatabase();
const accounts = supplierAccounts(database);
const RUN = randomUUID().slice(0, 6);
const RESELLER_KEY = "35261111222333000181550010000048211123456789";
const REMESSA_KEY = "31261145723174000110550010000012341000012345";
const SALE_KEY = "31261145723174000110550010000012351000012350";
const orderIds: string[] = [];

test.afterAll(async () => {
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

/** A Bling account already authorized: the stand-in answers its operations. */
async function connectBling(supplierId: string) {
  await database.insert(supplierErpConnections).values({
    supplierId,
    provider: "bling",
    accessTokenEnc: "e2e-not-a-token",
    refreshTokenEnc: "e2e-not-a-token",
    expiresAt: new Date(Date.now() + 6 * 3600_000),
    status: "connected",
  });
}

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

async function insertParcel(supplierId: string, productId: string) {
  const reseller = await demoReseller();
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: reseller.tenantId,
      storeConnectionId: reseller.storeId,
      externalOrderId: `E2E-ORDEM-${randomUUID().slice(0, 8)}`,
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
      title: "Vestido venda à ordem",
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
      status: "forwarded",
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
        { orderItemId: item.id, title: "Vestido venda à ordem", sku: "ORDEM-1", quantity: 1 },
      ],
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) throw new Error("Shipment missing");
  return { ...order, shipmentId: shipment.id, tenantId: reseller.tenantId };
}

/** The supplier's brand with one product, and a parcel of the demo reseller sold in venda à ordem. */
async function onBehalfParcel(page: Parameters<typeof accounts.signUp>[0], name: string) {
  const email = await accounts.signUp(page, name);
  const supplierId = await giveTestBrand(database, email, name);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `ORDEM-${randomUUID().slice(0, 8)}`,
      title: "Vestido venda à ordem",
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 5,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) throw new Error("Product missing");
  return { supplierId, parcel: await insertParcel(supplierId, product.id) };
}

test("o fornecedor liga a venda à ordem em Marca e salva as naturezas do Bling", async ({
  page,
}) => {
  const email = await accounts.signUp(page, `Ateliê Ordem ${RUN}`);
  const supplierId = await giveTestBrand(database, email, `Ateliê Ordem ${RUN}`);
  await connectBling(supplierId);

  await gotoHydrated(page, "/fornecedor/painel/marca");
  await page.getByRole("radio", { name: /Venda à ordem/ }).check();
  const bling = page.getByRole("region", { name: "Naturezas de operação no Bling" });
  await expect(bling.getByLabel("Natureza da remessa (a nota que vai na caixa)")).toHaveText(
    "Remessa por conta e ordem de terceiros",
  );
  await expect(bling.getByLabel("Natureza da venda para o revendedor")).toHaveText("Venda à ordem");
  await bling.getByRole("button", { name: "Salvar naturezas" }).click();

  await expect(bling.getByText("Naturezas salvas")).toBeVisible();
  await expect(page.getByLabel("Remessa · outro estado")).toHaveValue("6923");
  await expect(page.getByLabel("Venda ao revendedor · dentro do estado")).toHaveValue("5119");
  const [saved] = await database
    .select({
      shipment: supplierErpConnections.onBehalfShipmentOperationId,
      sale: supplierErpConnections.onBehalfSaleOperationId,
    })
    .from(supplierErpConnections)
    .where(eq(supplierErpConnections.supplierId, supplierId));
  expect(saved).toEqual({ shipment: 502, sale: 503 });
});

test("o fornecedor espera a nota do revendedor e depois vê a remessa e a venda", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const { supplierId, parcel } = await onBehalfParcel(page, `Ateliê Notas ${RUN}`);
  // The demo reseller is shared by other specs: its profile stays as seeded (the screens follow
  // the parcel's notes, not the profile).
  await database.insert(shipmentResellerInvoices).values({
    shipmentId: parcel.shipmentId,
    tenantId: parcel.tenantId,
  });

  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${parcel.externalOrderId}`);
  await page
    .getByRole("button", { name: `Pedido ${parcel.externalOrderId}` })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("region", { name: "Nota do revendedor" }).getByText("Esperando o revendedor"),
  ).toBeVisible();

  await database
    .update(shipmentResellerInvoices)
    .set({ accessKey: RESELLER_KEY, number: "4821", series: "1", source: "typed" })
    .where(eq(shipmentResellerInvoices.shipmentId, parcel.shipmentId));
  const authorized = {
    provider: "bling" as const,
    status: "authorized" as const,
    authorizedAt: new Date(),
  };
  await database.insert(shipmentInvoices).values([
    {
      ...authorized,
      shipmentId: parcel.shipmentId,
      supplierId,
      kind: "on_behalf_shipment",
      number: "1234",
      series: "1",
      accessKey: REMESSA_KEY,
    },
    {
      ...authorized,
      shipmentId: parcel.shipmentId,
      supplierId,
      kind: "on_behalf_sale",
      number: "1235",
      series: "1",
      accessKey: SALE_KEY,
    },
  ]);
  await page.reload();
  await page
    .getByRole("button", { name: `Pedido ${parcel.externalOrderId}` })
    .filter({ visible: true })
    .click();

  const remessa = dialog.getByRole("region", { name: "Nota de remessa (vai na caixa)" });
  const sale = dialog.getByRole("region", { name: "Nota de venda para o revendedor" });
  await expect(remessa.getByText("1234 · série 1")).toBeVisible();
  await expect(sale.getByText("Empresa do revendedor")).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Nota do revendedor" })).toHaveCount(0);

  const resellerContext = await browser.newContext();
  const resellerPage = await resellerContext.newPage();
  await signIn(resellerPage, DEMO_USER);
  await gotoHydrated(resellerPage, `/pedidos/${parcel.id}`);
  await expect(
    resellerPage
      .getByRole("region", { name: "Nota de remessa do fornecedor" })
      .getByText("Nota 1234 · série 1"),
  ).toBeVisible();
  const purchase = resellerPage.getByRole("region", {
    name: "Nota de compra (do fornecedor para você)",
  });
  await expect(purchase.getByText("A sua empresa", { exact: true })).toBeVisible();
  await expect(purchase.getByRole("link", { name: "Baixar XML" })).toHaveAttribute(
    "href",
    /nota=venda/,
  );
  await resellerContext.close();
});
