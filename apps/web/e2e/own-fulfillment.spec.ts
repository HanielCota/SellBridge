import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database";
import { ensureSellerCatalog, upsertStoreConnection } from "@sellbridge/database/repositories";
import {
  member,
  orderItems,
  orders,
  organization,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { testStoreInput } from "../../../packages/database/src/testing/fixtures";
import { requireEnvironmentVariable } from "./environment";
import { gotoHydrated, signUp } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const externalId = `OWN-FUL-${randomUUID()}`;
let tenantId = "";
let sourceId = "";
let email = "";
let orderId = "";

async function customerOrder(page: Page) {
  email = await signUp(page, "Mixed Shipment Customer");
  const [tenant] = await database
    .select({ id: member.organizationId })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(user.email, email));
  if (!tenant) throw new Error("Customer tenant missing");
  tenantId = tenant.id;
  const own = await ensureSellerCatalog(database, tenantId);
  const [external] = await database
    .insert(suppliers)
    .values({
      name: `External Shipment ${randomUUID()}`,
      niche: "Validation",
      state: "SP",
      city: "Validation",
    })
    .returning();
  if (!external) throw new Error("External source missing");
  sourceId = external.id;
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenantId, randomUUID()),
    supplierId: sourceId,
  });
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: externalId,
      status: "paid",
      totalCents: 6000,
      buyerName: "Parcel Customer",
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("Order missing");
  orderId = order.id;
  for (const source of [own.id, sourceId]) {
    const title = source === own.id ? "Private packing item" : "External packing item";
    const [product] = await database
      .insert(supplierProducts)
      .values({
        supplierId: source,
        sku: randomUUID(),
        title,
        costCents: 1000,
        suggestedPriceCents: 3000,
        stock: 10,
        active: true,
        reviewStatus: "approved",
      })
      .returning();
    if (!product) throw new Error("Product missing");
    await database.insert(orderItems).values({
      tenantId,
      orderId,
      supplierProductId: product.id,
      title,
      quantity: 1,
      unitPriceCents: 3000,
      unitCostCents: 1000,
    });
  }
}

test.afterAll(async () => {
  if (tenantId) await database.delete(organization).where(eq(organization.id, tenantId));
  if (sourceId) await database.delete(suppliers).where(eq(suppliers.id, sourceId));
  if (email) await database.delete(user).where(eq(user.email, email));
  await database.$client.end();
});

async function openOrder(page: Page) {
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await page.getByRole("button", { name: "Operar pedido", exact: true }).click();
  return page.getByRole("dialog", { name: "Operar pedido" });
}

test("mixed parcels separate access and let the owner stop, restart and ship their preparation", async ({
  page,
  browser,
}) => {
  await customerOrder(page);
  const dialog = await openOrder(page);
  for (const [label, value] of Object.entries({
    Destinatário: "Parcel Customer",
    Rua: "Parcel Street",
    Número: "12",
    Bairro: "Center",
    Cidade: "São Paulo",
    UF: "SP",
    CEP: "01001-000",
  })) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  await expect(dialog.getByText("You fulfill this item")).toBeVisible();
  await dialog.getByRole("button", { name: "Prepare shipments", exact: true }).click();
  const own = dialog
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Your shipment", exact: true }) });
  const external = dialog
    .locator("section")
    .filter({ has: page.getByText("External packing item", { exact: false }) });
  await expect(own.getByText("Private packing item", { exact: false })).toBeVisible();
  await expect(own.getByRole("button", { name: /link.*fornecedor/ })).toHaveCount(0);
  await expect(own.getByLabel("Link do fornecedor")).toHaveCount(0);
  const supplierLink = external.getByLabel("Link do fornecedor");
  await expect(supplierLink).toBeVisible();
  const supplier = await browser.newPage();
  await gotoHydrated(supplier, await supplierLink.inputValue());
  await expect(supplier.getByText("External packing item", { exact: false })).toBeVisible();
  await expect(supplier.getByText("Private packing item", { exact: false })).toHaveCount(0);
  await own.getByRole("button", { name: "Stop preparation", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Stop your shipment preparation?",
    exact: true,
  });
  await confirm.getByLabel("Reason", { exact: true }).fill("Repack the parcel");
  await confirm.getByRole("button", { name: "Stop preparation", exact: true }).click();
  await own.getByRole("button", { name: "Restart preparation", exact: true }).click();
  await own.getByRole("button", { name: "Start picking", exact: true }).click();
  await own.getByRole("button", { name: "Mark ready to ship", exact: true }).click();
  await own.getByLabel("Carrier", { exact: true }).fill("Postal Service");
  await own.getByLabel("Tracking code", { exact: true }).fill("OWN123456BR");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const popupPromise = page.waitForEvent("popup");
  await own.getByRole("button", { name: "Print packing list", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Packing list" })).toBeVisible();
  await expect(popup.getByText("Private packing item", { exact: true })).toBeVisible();
  await expect(popup.getByText("External packing item", { exact: true })).toHaveCount(0);
  await popup.close();
  await own.getByRole("button", { name: "Record shipment", exact: true }).click();
  await expect(own.getByText("OWN123456BR", { exact: false })).toBeVisible();
  await own.getByRole("button", { name: "Confirm delivery", exact: true }).click();
  const [order] = await database.select().from(orders).where(eq(orders.id, orderId));
  expect(order?.status).toBe("paid");
  for (const label of [
    "Marcar como aceito",
    "Marcar como em separação",
    "Marcar como pronto para envio",
  ]) {
    await supplier.getByRole("button", { name: label, exact: true }).click();
  }
  await supplier.getByLabel("Transportadora", { exact: true }).fill("External Carrier");
  await supplier.getByLabel("Código de rastreio", { exact: true }).fill("EXTERNAL123BR");
  await supplier.getByRole("button", { name: "Marcar como enviado", exact: true }).click();
  await expect(supplier.getByText("EXTERNAL123BR", { exact: false })).toBeVisible();
  await openOrderAfterRefresh(page);
  const refreshed = page.getByRole("dialog", { name: "Operar pedido" });
  await refreshed.getByRole("button", { name: "Marcar como entregue", exact: true }).click();
  const [delivered] = await database.select().from(orders).where(eq(orders.id, orderId));
  expect(delivered?.status).toBe("delivered");
  await supplier.close();
});

async function openOrderAfterRefresh(page: Page) {
  await page.keyboard.press("Escape");
  await openOrder(page);
}
