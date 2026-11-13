import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  member,
  orders,
  orderShipments,
  storeConnections,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated, signUp } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const orderIds: string[] = [];

test.afterAll(async () => {
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

async function tenantOf(email: string): Promise<string> {
  const [row] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (row === undefined) throw new Error(`Test account without a profile: ${email}`);
  return row.tenantId;
}

/** A store selling the brand with one sale whose parcel the supplier already sent. */
async function shippedSale(tenantId: string, supplierId: string, shopName: string) {
  const [store] = await database
    .insert(storeConnections)
    .values({ tenantId, marketplace: "mock", externalShopId: randomUUID(), shopName, supplierId })
    .returning({ id: storeConnections.id });
  if (store === undefined) throw new Error("Store missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: `E2E-CANC-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 15_900,
      buyerName: "Maria Cancelamento",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id, externalOrderId: orders.externalOrderId });
  if (order === undefined) throw new Error("Order missing");
  orderIds.push(order.id);
  await database.insert(orderShipments).values({
    tenantId,
    orderId: order.id,
    supplierId,
    status: "shipped",
    address: {
      recipient: "Maria Cancelamento",
      street: "Rua das Flores",
      number: "10",
      complement: "",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      postalCode: "01001-000",
    },
    items: [],
  });
  return order;
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "pt-BR" });
  return context.newPage();
}

test("a store reports a cancellation from the order and the supplier finishes it from A fazer", async ({
  browser,
}) => {
  test.slow();
  const suffix = randomUUID().slice(0, 6);
  const brandName = `Calçados Cancela ${suffix}`;
  const supplierPage = await newPage(browser);
  const supplierEmail = await accounts.signUp(supplierPage, brandName);
  const supplierId = await giveTestBrand(database, supplierEmail, brandName);
  const resellerPage = await newPage(browser);
  const resellerEmail = await signUp(resellerPage, "Revendedora Cancelamento");
  const order = await shippedSale(
    await tenantOf(resellerEmail),
    supplierId,
    `Loja Cancela ${suffix}`,
  );

  // From the order page the store and the order come filled in: only the type and the text.
  await gotoHydrated(resellerPage, `/pedidos/${order.id}`);
  await resellerPage.getByRole("link", { name: "Falar com o fornecedor" }).click();
  await resellerPage.getByRole("button", { name: /^Cancelamento/ }).click();
  await resellerPage.getByRole("button", { name: /Cancelou depois do envio/ }).click();
  await resellerPage
    .getByRole("textbox", { name: "O que o comprador fez com o pacote?" })
    .fill("O comprador recusou o pacote na entrega e ele vai voltar para vocês.");
  await resellerPage.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(resellerPage).toHaveURL(/\/suporte\/conversas\//);

  // The supplier's queue opens on A fazer, with the order number and its shortcuts.
  await gotoHydrated(supplierPage, "/suporte/revendedores");
  const tabs = supplierPage.getByRole("group", { name: "Situação das conversas" });
  await expect(tabs.getByRole("button", { name: /A fazer\s*1/ })).toBeVisible();
  await expect(
    supplierPage
      .getByText(new RegExp(`Cancelamento · Pedido ${order.externalOrderId}`))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    supplierPage.getByRole("link", { name: "Ver pedido" }).filter({ visible: true }),
  ).toHaveAttribute(
    "href",
    new RegExp(`/fornecedor/painel/pedidos\\?tab=shipped&query=${order.externalOrderId}`),
  );

  await supplierPage.getByRole("button", { name: "Finalizar" }).filter({ visible: true }).click();
  await expect(supplierPage.getByText("Conversa finalizada")).toBeVisible();
  await expect(tabs.getByRole("button", { name: /Finalizado\s*1/ })).toBeVisible();
  await tabs.getByRole("button", { name: /Finalizado/ }).click();
  await expect(
    supplierPage.getByRole("link", { name: "Cancelou depois do envio" }).filter({ visible: true }),
  ).toBeVisible();

  // The store sees it resolved and can write again, which brings it back to the supplier.
  await resellerPage.reload();
  await expect(resellerPage.getByText("Conversa resolvida.")).toBeVisible();
});
