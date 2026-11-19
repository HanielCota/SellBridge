import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  storeConnections,
  supplierPaymentAccounts,
  supplierProducts,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { ADMIN_USER, DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

// The e2e site sets the Mercado Pago keys (vite.config.ts): the option stays hidden even so.
const database = e2eDatabase();
const accounts = supplierAccounts(database);
const PRODUCT = `Bolsa de palha e2e ${randomUUID().slice(0, 8)}`;
const orderIds: string[] = [];

test.afterAll(async () => {
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

/** A supplier that linked Mercado Pago before it was hidden, and no Asaas account. */
async function supplierWithOldMercadoPago(page: Page, brand: string): Promise<string> {
  const email = await accounts.signUp(page, brand);
  const supplierId = await giveTestBrand(database, email, brand);
  await database.insert(supplierPaymentAccounts).values({
    supplierId,
    provider: "mercado_pago",
    status: "connected",
    accessTokenEnc: "e2e-not-a-token",
    providerAccountId: `e2e-${randomUUID().slice(0, 8)}`,
  });
  return supplierId;
}

/** A paid sale of the demo reseller forwarded to the supplier: 2 bags at R$ 40 each. */
async function forwardedSale(supplierId: string): Promise<string> {
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
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: `E2E-MP-${randomUUID().slice(0, 8)}`,
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
  return order.id;
}

test("Recebimentos mostra só a conta Asaas, mesmo para quem ligou o Mercado Pago", async ({
  page,
}) => {
  await supplierWithOldMercadoPago(page, "Ateliê Só Asaas E2E");

  await gotoHydrated(page, "/fornecedor/painel/recebimentos");

  await expect(page.getByText(/Os revendedores pagam você pelo Asaas/)).toBeVisible();
  const card = page.getByRole("region", { name: /Receber com proteção/ });
  await expect(card.getByRole("button", { name: "Abrir minha conta no Asaas" })).toBeVisible();
  await expect(page.getByRole("main").getByText(/Mercado Pago/)).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Para onde vão os próximos pagamentos" }),
  ).toHaveCount(0);
});

test("o revendedor não paga pelo Mercado Pago um fornecedor que só tem essa conta", async ({
  page,
  browser,
}) => {
  const supplierId = await supplierWithOldMercadoPago(page, "Ateliê Sem Asaas E2E");
  const orderId = await forwardedSale(supplierId);

  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${orderId}`);

  await expect(
    reseller.getByText(/Este fornecedor ainda não abriu a conta de recebimento no Asaas/),
  ).toBeVisible();
  await expect(reseller.getByRole("button", { name: /Pagar com/ })).toHaveCount(0);
  await expect(reseller.getByRole("main").getByText(/Mercado Pago/)).toHaveCount(0);
  await reseller.context().close();
});

test("ligar o Mercado Pago volta para Recebimentos sem ligar nada", async ({ page }) => {
  const email = await accounts.signUp(page, "Ateliê Link E2E");
  const supplierId = await giveTestBrand(database, email, "Ateliê Link E2E");

  await gotoHydrated(page, `/api/integracoes/mercado-pago/conectar?fornecedor=${supplierId}`);

  await expect(page).toHaveURL(/\/fornecedor\/painel\/recebimentos/);
  await expect(page.getByRole("main").getByText(/Mercado Pago/)).toHaveCount(0);
  const linked = await database
    .select({ id: supplierPaymentAccounts.id })
    .from(supplierPaymentAccounts)
    .where(
      and(
        eq(supplierPaymentAccounts.supplierId, supplierId),
        eq(supplierPaymentAccounts.provider, "mercado_pago"),
      ),
    );
  expect(linked).toHaveLength(0);
});

test("o aviso do Mercado Pago é recusado como desligado", async ({ request }) => {
  const response = await request.post("/api/webhooks/mercado-pago?type=payment&data.id=123", {
    data: { type: "payment", data: { id: "123" } },
  });

  expect(response.status()).toBe(404);
});

test("as configurações do admin não mostram a proteção para fornecedores novos", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);

  await gotoHydrated(page, "/admin/configuracoes");

  await expect(
    page.getByRole("region", { name: "Taxa do SellBridge nos pagamentos" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Proteção para fornecedores novos" })).toHaveCount(
    0,
  );
});
