import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  storeConnections,
  supplierProducts,
  suppliers,
} from "@sellbridge/database/schema";
import { suggestedTaxDefaults } from "@sellbridge/shared/supplier-fiscal";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated } from "./helpers";
import { tokenCipher } from "./marketplaces.server";
import {
  E2E_SHOPEE_NO_PICKUP_PREFIX,
  E2E_SHOPEE_ORDER_PREFIX,
  E2E_SHOPEE_SHOP_ID,
  E2E_SHOPEE_SUPPLIER_ADDRESS,
} from "./shopee.fixture";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const RUN = randomUUID().slice(0, 6);
const BUYER = `Ana Shopee ${RUN}`;
const SHOP_NAME = `Loja Shopee ${RUN}`;
const DAY_MILLISECONDS = 86_400_000;
const tenantIds: string[] = [];

test.afterAll(async () => {
  for (const tenantId of tenantIds) {
    await database.delete(orders).where(eq(orders.tenantId, tenantId));
    await database.delete(storeConnections).where(eq(storeConnections.tenantId, tenantId));
    await database.delete(organization).where(eq(organization.id, tenantId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

async function createResellerStore() {
  const tenantId = randomUUID();
  await database.insert(organization).values({
    id: tenantId,
    name: `Revenda Shopee ${RUN}`,
    slug: `revenda-shopee-${RUN}`,
    createdAt: new Date(),
  });
  tenantIds.push(tenantId);
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "shopee",
      externalShopId: E2E_SHOPEE_SHOP_ID,
      shopName: SHOP_NAME,
      accessTokenEnc: tokenCipher.encrypt("e2e-shopee-token"),
    })
    .returning({ id: storeConnections.id });
  if (store === undefined) throw new Error("Store missing");
  return { tenantId, storeId: store.id };
}

// The stand-in answers for one shop, and a shop has one live store: the tests share it.
let sharedResellerStore: ReturnType<typeof createResellerStore> | null = null;

function resellerStore() {
  sharedResellerStore ??= createResellerStore();
  return sharedResellerStore;
}

async function insertSale(
  place: { tenantId: string; storeId: string; supplierId: string; productId: string },
  orderPrefix: string,
) {
  const externalOrderId = `${orderPrefix}${randomInt(10_000_000, 90_000_000)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: place.tenantId,
      storeConnectionId: place.storeId,
      externalOrderId,
      status: "paid",
      totalCents: 8_990,
      buyerName: BUYER,
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("Order missing");
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId: place.tenantId,
      orderId: order.id,
      supplierProductId: place.productId,
      title: "Vestido midi",
      quantity: 1,
      unitPriceCents: 8_990,
      unitCostCents: 4_000,
    })
    .returning({ id: orderItems.id });
  if (item === undefined) throw new Error("Order item missing");
  await database.insert(orderShipments).values({
    tenantId: place.tenantId,
    orderId: order.id,
    supplierId: place.supplierId,
    status: "ready",
    dispatchDeadlineAt: new Date(Date.now() + 3 * DAY_MILLISECONDS),
    address: {
      recipient: BUYER,
      street: "Rua das Palmeiras",
      number: "20",
      complement: "",
      neighborhood: "Centro",
      city: "Santos",
      state: "SP",
      postalCode: "11010-000",
    },
    items: [{ orderItemId: item.id, title: "Vestido midi", sku: "VES-MID", quantity: 1 }],
  });
  return externalOrderId;
}

async function supplierWithSale(page: Page, orderPrefix: string) {
  const email = await accounts.signUp(page, `Ateliê ${RUN}`);
  const supplierId = await giveTestBrand(database, email, `Ateliê ${RUN}`);
  await database
    .update(suppliers)
    .set({
      fiscalProfile: {
        cnpj: "11.222.333/0001-81",
        legalName: "Ateliê Divinópolis Confecções Ltda",
        stateRegistration: "062.307.904/0081",
        regime: "simples",
        address: E2E_SHOPEE_SUPPLIER_ADDRESS,
        defaults: suggestedTaxDefaults("simples"),
      },
    })
    .where(eq(suppliers.id, supplierId));
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `VES-${RUN}-${randomInt(1000, 9999)}`,
      title: "Vestido midi",
      costCents: 4_000,
      suggestedPriceCents: 8_990,
      stock: 5,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) throw new Error("Product missing");
  const store = await resellerStore();
  const orderNumber = await insertSale(
    { ...store, supplierId, productId: product.id },
    orderPrefix,
  );
  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${encodeURIComponent(BUYER)}`);
  return orderNumber;
}

async function askForLabel(page: Page, orderNumber: string) {
  await page
    .getByRole("button", { name: `Pedido ${orderNumber}` })
    .filter({ visible: true })
    .click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Imprimir etiqueta do marketplace" })
    .click();
  return popupPromise;
}

test("o fornecedor confirma a coleta no endereço dele antes da etiqueta da Shopee", async ({
  page,
}) => {
  const orderNumber = await supplierWithSale(page, E2E_SHOPEE_ORDER_PREFIX);

  const popup = await askForLabel(page, orderNumber);

  await expect(
    popup.getByRole("heading", { name: "Confirme onde a transportadora vai buscar o pacote" }),
  ).toBeVisible();
  await expect(popup.getByText("Rua Goiás, 120")).toBeVisible();
  await expect(popup.getByText("Avenida Paulista")).toHaveCount(0);
  const labelResponse = popup.waitForEvent("response", (response) =>
    response.url().includes("/etiqueta"),
  );
  await popup.getByRole("button", { name: "Confirmar coleta e gerar etiqueta" }).click();
  const response = await labelResponse;

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
});

test("sem o endereço do fornecedor na Shopee, nenhuma coleta é agendada e o aviso diz o que cadastrar", async ({
  page,
}) => {
  const orderNumber = await supplierWithSale(page, E2E_SHOPEE_NO_PICKUP_PREFIX);

  const popup = await askForLabel(page, orderNumber);

  await expect(
    popup.getByRole("heading", { name: "Falta o endereço de coleta na Shopee" }),
  ).toBeVisible();
  await expect(popup.getByText("CEP 35500-024")).toBeVisible();
  await expect(popup.getByText("Nenhuma coleta foi agendada.", { exact: false })).toBeVisible();
});
