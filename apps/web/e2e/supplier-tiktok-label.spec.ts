import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated } from "./helpers";
import { tokenCipher } from "./marketplaces.server";
import {
  E2E_TIKTOK_SHOP_ID,
  E2E_TIKTOK_SHOP_ORDER_PREFIX,
  E2E_TIKTOK_SHOP_UNARRANGED_PREFIX,
} from "./tiktok-shop.fixture";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const RUN = randomUUID().slice(0, 6);
const BUYER = `Rui TikTok ${RUN}`;
const DAY_MILLISECONDS = 86_400_000;
const tenantIds: string[] = [];

test.afterAll(async () => {
  // Orders hold the store and the parcels hold the supplier: remove them first.
  for (const tenantId of tenantIds) {
    await database.delete(orders).where(eq(orders.tenantId, tenantId));
    await database.delete(storeConnections).where(eq(storeConnections.tenantId, tenantId));
    await database.delete(organization).where(eq(organization.id, tenantId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

/** A reseller of its own with a TikTok Shop store the stand-in answers for. */
async function createResellerStore() {
  const tenantId = randomUUID();
  await database.insert(organization).values({
    id: tenantId,
    name: `Revenda TikTok ${RUN}`,
    slug: `revenda-tiktok-${RUN}`,
    createdAt: new Date(),
  });
  tenantIds.push(tenantId);
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "tiktok_shop",
      externalShopId: E2E_TIKTOK_SHOP_ID,
      shopName: `Loja TikTok ${RUN}`,
      accessTokenEnc: tokenCipher.encrypt("e2e-tiktok-shop-token"),
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
  // Below 90,000,000: a sale under the arranged prefix ("5770") never starts with the
  // unarranged one ("57709"), which the stand-in answers with no package.
  const externalOrderId = `${orderPrefix}${randomInt(10_000_000, 90_000_000)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: place.tenantId,
      storeConnectionId: place.storeId,
      externalOrderId,
      status: "paid",
      totalCents: 5_990,
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
      title: "Garrafa de vidro",
      quantity: 1,
      unitPriceCents: 5_990,
      unitCostCents: 2_000,
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
    items: [{ orderItemId: item.id, title: "Garrafa de vidro", sku: "GAR-VID", quantity: 1 }],
  });
  return externalOrderId;
}

async function supplierWithSale(page: Page, orderPrefix: string) {
  const email = await accounts.signUp(page, `Vidraria ${RUN}`);
  const supplierId = await giveTestBrand(database, email, `Vidraria ${RUN}`);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `GAR-${RUN}-${randomInt(1000, 9999)}`,
      title: "Garrafa de vidro",
      costCents: 2_000,
      suggestedPriceCents: 5_990,
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

function orderButton(page: Page, orderNumber: string) {
  return page.getByRole("button", { name: `Pedido ${orderNumber}` }).filter({ visible: true });
}

test("o fornecedor baixa a etiqueta do TikTok Shop em PDF, direto, sem escolher impressora", async ({
  page,
}) => {
  const orderNumber = await supplierWithSale(page, E2E_TIKTOK_SHOP_ORDER_PREFIX);
  await expect(orderButton(page, orderNumber)).toBeVisible();
  // The batch print is Mercado Livre's: a TikTok parcel ready to ship has no box to tick.
  await expect(
    page.getByRole("checkbox", { name: `Selecionar pedido ${orderNumber}` }),
  ).toHaveCount(0);

  await orderButton(page, orderNumber).click();
  const dialog = page.getByRole("dialog");
  const labelResponse = page
    .context()
    .waitForEvent("response", (response) => response.url().includes("/etiqueta"));
  await dialog.getByRole("button", { name: "Imprimir etiqueta do marketplace" }).click();
  const response = await labelResponse;

  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(response.status()).toBe(200);
  // The PDF opens in the browser's viewer, which keeps no body to read back: the bytes are
  // checked in tiktok-shop-connector.test.ts, and the recorded print below proves it was served.
  expect(response.headers()["content-type"]).toBe("application/pdf");
  await page.keyboard.press("Escape");
  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${encodeURIComponent(BUYER)}`);
  await expect(page.getByText("Etiqueta impressa").filter({ visible: true })).toBeVisible();
});

test("um pedido do TikTok Shop sem envio organizado fica aguardando o canal", async ({ page }) => {
  const orderNumber = await supplierWithSale(page, E2E_TIKTOK_SHOP_UNARRANGED_PREFIX);

  await orderButton(page, orderNumber).click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Imprimir etiqueta do marketplace" })
    .click();
  const popup = await popupPromise;

  await expect(popup.getByText(/Organize o envio no TikTok Shop/)).toBeVisible();
  await popup.close();
  await page.keyboard.press("Escape");
  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${encodeURIComponent(BUYER)}`);
  await expect(page.getByText("Aguardando o canal").filter({ visible: true })).toBeVisible();
});
