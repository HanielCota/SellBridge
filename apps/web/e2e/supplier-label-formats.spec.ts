import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { eq } from "drizzle-orm";
import { formatDeadlineDay } from "../src/lib/relative-time";
import { e2eDatabase } from "./database";
import { gotoHydrated } from "./helpers";
import { tokenCipher } from "./marketplaces.server";
import {
  E2E_MERCADO_LIVRE_ORDER_PREFIX,
  E2E_MERCADO_LIVRE_SELLER_ID,
  standInZpl,
} from "./mercado-livre.fixture";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const RUN = randomUUID().slice(0, 6);
const BUYER = `Lia Zebra ${RUN}`;
const STORE_NAME = `Loja Térmica ${RUN}`;
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

/** A reseller of its own with a Mercado Livre store the stand-in answers for. */
async function createResellerStore() {
  const tenantId = randomUUID();
  await database.insert(organization).values({
    id: tenantId,
    name: `Revenda Zebra ${RUN}`,
    slug: `revenda-zebra-${RUN}`,
    createdAt: new Date(),
  });
  tenantIds.push(tenantId);
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "mercado_livre",
      externalShopId: E2E_MERCADO_LIVRE_SELLER_ID,
      shopName: STORE_NAME,
      accessTokenEnc: tokenCipher.encrypt("e2e-mercado-livre-token"),
    })
    .returning({ id: storeConnections.id });
  if (store === undefined) throw new Error("Store missing");
  return { tenantId, storeId: store.id };
}

// The stand-in answers for one seller, and a seller has one live store: the tests share it.
let sharedResellerStore: ReturnType<typeof createResellerStore> | null = null;

function resellerStore() {
  sharedResellerStore ??= createResellerStore();
  return sharedResellerStore;
}

interface Sale {
  status: FulfillmentStatus;
  dispatchDeadlineAt: Date;
}

async function insertSale(
  place: { tenantId: string; storeId: string; supplierId: string; productId: string },
  sale: Sale,
) {
  const externalOrderId = `${E2E_MERCADO_LIVRE_ORDER_PREFIX}${randomInt(10_000_000, 99_999_999)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: place.tenantId,
      storeConnectionId: place.storeId,
      externalOrderId,
      status: "paid",
      totalCents: 8_900,
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
      title: "Caneca térmica",
      quantity: 1,
      unitPriceCents: 8_900,
      unitCostCents: 3_000,
    })
    .returning({ id: orderItems.id });
  if (item === undefined) throw new Error("Order item missing");
  await database.insert(orderShipments).values({
    tenantId: place.tenantId,
    orderId: order.id,
    supplierId: place.supplierId,
    status: sale.status,
    marketplaceLogisticType: "drop_off",
    dispatchDeadlineAt: sale.dispatchDeadlineAt,
    address: {
      recipient: BUYER,
      street: "Rua das Flores",
      number: "10",
      complement: "",
      neighborhood: "Centro",
      city: "Campinas",
      state: "SP",
      postalCode: "13010-000",
    },
    items: [{ orderItemId: item.id, title: "Caneca térmica", sku: "CAN-TER", quantity: 1 }],
  });
  return externalOrderId;
}

async function supplierWithSales(page: Page, sales: readonly Sale[]) {
  const email = await accounts.signUp(page, `Ateliê Zebra ${RUN}`);
  const supplierId = await giveTestBrand(database, email, `Ateliê Zebra ${RUN}`);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `CAN-${RUN}`,
      title: "Caneca térmica",
      costCents: 3_000,
      suggestedPriceCents: 8_900,
      stock: 5,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) throw new Error("Product missing");
  const store = await resellerStore();
  const place = { ...store, supplierId, productId: product.id };
  const orderNumbers: string[] = [];
  for (const sale of sales) {
    orderNumbers.push(await insertSale(place, sale));
  }
  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${encodeURIComponent(BUYER)}`);
  return orderNumbers;
}

function orderButton(page: Page, orderNumber: string) {
  return page.getByRole("button", { name: `Pedido ${orderNumber}` }).filter({ visible: true });
}

test("o fornecedor vê o prazo de postagem do Mercado Livre, no prazo e atrasado", async ({
  page,
}) => {
  const now = new Date();
  const ahead = new Date(now.getTime() + 3 * DAY_MILLISECONDS);
  const missed = new Date(now.getTime() - 2 * DAY_MILLISECONDS);
  const [onTime, late] = await supplierWithSales(page, [
    { status: "accepted", dispatchDeadlineAt: ahead },
    { status: "accepted", dispatchDeadlineAt: missed },
  ]);
  if (onTime === undefined || late === undefined) throw new Error("Sales missing");
  const onTimeLabel = `Postar no Mercado Livre até ${formatDeadlineDay(ahead, now)}`;
  const lateLabel = `Postagem atrasada (prazo: ${formatDeadlineDay(missed, now)})`;

  await expect(orderButton(page, onTime)).toBeVisible();
  await expect(page.getByText(onTimeLabel).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(lateLabel).filter({ visible: true })).toBeVisible();

  await orderButton(page, late).click();
  await expect(page.getByRole("dialog").getByText(lateLabel)).toBeVisible();
  await page.keyboard.press("Escape");

  // A phone draws each order as a card of its own.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByText(onTimeLabel).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(lateLabel).filter({ visible: true })).toBeVisible();
});

test("o fornecedor baixa a etiqueta em ZPL, de um pedido e em lote", async ({ page }) => {
  const ahead = new Date(Date.now() + 3 * DAY_MILLISECONDS);
  const [orderNumber] = await supplierWithSales(page, [
    { status: "ready", dispatchDeadlineAt: ahead },
  ]);
  if (orderNumber === undefined) throw new Error("Sale missing");

  // One order, from its panel: the ZPL downloads in the tab the form opens.
  await orderButton(page, orderNumber).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Imprimir etiqueta do marketplace" }).click();
  // The form opens a tab, but a download is reported on the page that submitted it.
  const formDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Em ZPL/ }).click();
  const single = await formDownload;
  expect(single.suggestedFilename()).toBe(`etiqueta-zebra-pedido-${orderNumber}.txt`);
  expect(await readFile(await single.path(), "utf8")).toBe(standInZpl(orderNumber));
  // An Escape while the format menu is still closing goes to the menu, and the panel stays open
  // over the list (seen on CI): close the panel only once the menu is gone.
  await expect(page.getByRole("menu")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Several orders, from the selection bar: one ZPL file per reseller store.
  await page
    .getByRole("checkbox", { name: `Selecionar pedido ${orderNumber}` })
    .filter({ visible: true })
    .check();
  await page.getByRole("button", { name: "Imprimir etiquetas (1)" }).click();
  await page.getByRole("menuitem", { name: /Em ZPL/ }).click();
  await expect(page.getByText("1 etiqueta pronta")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: `Baixar etiquetas Zebra · ${STORE_NAME} (1)` }).click();
  const batch = await download;
  expect(batch.suggestedFilename()).toBe(`etiquetas-zebra-loja-termica-${RUN.toLowerCase()}.txt`);
  expect(await readFile(await batch.path(), "utf8")).toBe(standInZpl(orderNumber));
  await expect(page.getByText("Abra o arquivo no programa da sua impressora Zebra")).toBeVisible();

  // On a phone the longer reprint button wraps inside the panel instead of widening it.
  await page.setViewportSize({ width: 375, height: 812 });
  await orderButton(page, orderNumber).click();
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByRole("button", { name: "Reimprimir etiqueta do marketplace" }),
  ).toBeVisible();
  const overflowInPixels = await panel.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  // One pixel is sub-pixel rounding; the unwrapped button overflowed by about 30.
  expect(overflowInPixels).toBeLessThanOrEqual(1);
});
