import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  platformSettings,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ADMIN_USER, DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const PRODUCT = `Bolsa de palha e2e ${randomUUID().slice(0, 8)}`;
const orderIds: string[] = [];

test.afterAll(async () => {
  await database.delete(platformSettings);
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

/** A paid sale of the demo reseller forwarded to the supplier: 2 bags at R$ 40 each. */
async function forwardedSale(supplierId: string): Promise<{ orderId: string }> {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `BOL-${randomUUID().slice(0, 8)}`,
      title: PRODUCT,
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 6,
    })
    .returning({ id: supplierProducts.id });
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenant?.id ?? ""));
  if (product === undefined || tenant === undefined || store === undefined) {
    throw new Error("Seed demo missing");
  }
  const number = `E2E-MP-${randomUUID().slice(0, 8)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: number,
      status: "paid",
      totalCents: 19_800,
      buyerName: "Paula Ribeiro",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("Order missing");
  orderIds.push(order.id);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId: tenant.id,
      orderId: order.id,
      supplierProductId: product.id,
      title: "Bolsa de palha do revendedor",
      quantity: 2,
      unitPriceCents: 9_900,
      unitCostCents: 4_000,
    })
    .returning({ id: orderItems.id });
  if (item === undefined) throw new Error("Order item missing");
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
    items: [{ orderItemId: item.id, title: PRODUCT, sku: "BOL-E2E", quantity: 2 }],
  });
  return { orderId: order.id };
}

test("o fornecedor liga o Mercado Pago e o revendedor paga o pedido com Pix", async ({
  page,
  browser,
}) => {
  const email = await accounts.signUp(page, "Ateliê Mercado Pago E2E");
  const supplierId = await giveTestBrand(database, email, "Ateliê Mercado Pago E2E");
  const sale = await forwardedSale(supplierId);

  await gotoHydrated(page, "/fornecedor/painel/recebimentos");
  const card = page.getByRole("region", { name: "Mercado Pago" });
  await expect(card.getByText("Não ligada")).toBeVisible();
  await card.getByRole("link", { name: "Ligar conta Mercado Pago" }).click();
  await page.getByRole("button", { name: "Autorizar" }).click();
  await expect(page.getByRole("status")).toContainText("Conta Mercado Pago ligada");
  await expect(card.getByText(/Ligada ·/)).toBeVisible();

  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await expect(reseller.getByText("Aguardando pagamento")).toBeVisible();
  await expect(reseller.getByText("R$ 80,00", { exact: true })).toBeVisible();
  await reseller.getByRole("button", { name: "Pagar com Pix ou cartão" }).click();
  await expect(reseller.getByText("Total: R$ 80,00")).toBeVisible();
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await expect(reseller.getByText(/Fornecedor pago ·/)).toBeVisible();
  await expect(reseller.getByText("R$ 80,00 pagos por Pix no Mercado Pago.")).toBeVisible();
  await expect(reseller.getByRole("button", { name: "Pagar com Pix ou cartão" })).toHaveCount(0);
  await reseller.context().close();

  await gotoHydrated(page, "/fornecedor/painel/pedidos");
  await expect(
    page
      .getByText(/^✓ Pago ·/)
      .locator("visible=true")
      .first(),
  ).toBeVisible();
});

test("o admin define a taxa do SellBridge e ela vale no próximo pagamento", async ({
  page,
  browser,
}) => {
  const email = await accounts.signUp(page, "Ateliê Taxa E2E");
  const supplierId = await giveTestBrand(database, email, "Ateliê Taxa E2E");
  const sale = await forwardedSale(supplierId);
  await gotoHydrated(page, "/fornecedor/painel/recebimentos");
  await page.getByRole("link", { name: "Ligar conta Mercado Pago" }).click();
  await page.getByRole("button", { name: "Autorizar" }).click();
  await expect(page.getByRole("status")).toContainText("Conta Mercado Pago ligada");

  const admin = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(admin, ADMIN_USER);
  await gotoHydrated(admin, "/admin/configuracoes");
  const fee = admin.getByLabel("Taxa (%)");
  await fee.fill("31");
  await fee.blur();
  await expect(admin.getByRole("alert")).toHaveText("A taxa vai de 0 a 30%. Diminua o valor.");
  await fee.fill("5");
  await expect(
    admin.getByText("Num pedido de R$ 100,00, o SellBridge fica com R$ 5,00."),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Salvar taxa" }).click();
  await expect(admin.getByText(/^5% · desde/)).toBeVisible();
  await admin.context().close();

  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await reseller.getByRole("button", { name: "Pagar com Pix ou cartão" }).click();
  await expect(reseller.getByText("Taxa do marketplace: R$ 4,00")).toBeVisible();
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await expect(reseller.getByText(/Fornecedor pago ·/)).toBeVisible();
  await reseller.context().close();
});
