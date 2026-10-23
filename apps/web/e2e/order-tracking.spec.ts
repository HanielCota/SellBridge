import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { forwardOrder } from "@sellbridge/database/repositories";
import {
  organization,
  orderItems,
  orderShipments,
  orders,
  shipmentEvents,
  storeConnections,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { forwardableProduct } from "./catalog-fixtures";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const externalId = `E2E-TRK-${randomUUID()}`;

/** A Correios-format code no other test uses. */
function uniqueCorreiosCode(prefix: string): string {
  return `${prefix}${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}BR`;
}

const trackingCode = uniqueCorreiosCode("TK");
let orderId = "";

test.beforeAll(async () => {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  if (!tenant) throw new Error("Seed demo missing");
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenant.id));
  const product = await forwardableProduct(database);
  if (!store || !product) throw new Error("Seed catalog missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: externalId,
      status: "paid",
      totalCents: 9900,
      buyerName: "Maria Silva",
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("Order missing");
  orderId = order.id;
  await database.insert(orderItems).values({
    tenantId: tenant.id,
    orderId,
    supplierProductId: product.id,
    title: product.title,
    quantity: 1,
    unitPriceCents: 9900,
    unitCostCents: product.costCents,
  });
  const [link] = await forwardOrder(database, tenant.id, {
    orderId,
    address: {
      recipient: "Maria Silva",
      street: "Rua das Flores",
      number: "10",
      complement: "",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      postalCode: "01001-000",
    },
    notes: "",
  });
  if (!link) throw new Error("Shipment missing");
  // Sent two days ago with a Correios code, as the supplier registers it.
  await database
    .update(orderShipments)
    .set({ status: "shipped", carrier: "Correios", trackingCode })
    .where(eq(orderShipments.id, link.shipmentId));
  await database.insert(shipmentEvents).values({
    shipmentId: link.shipmentId,
    status: "shipped",
    actor: "Fornecedor",
    note: "",
    createdAt: new Date(Date.now() - 2 * 86_400_000),
  });
});

test.afterAll(async () => {
  if (orderId) await database.delete(orders).where(eq(orders.id, orderId));
  await database.$client.end();
});

test("reseller tracks an order by code, by order number, by hand and from the order dialog", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.getByRole("button", { name: "Rastreio" }).click();
  const searchBox = page.getByLabel("Código de rastreio ou número do pedido");
  const parcel = page.getByRole("region", { name: `Rastreio do pedido ${externalId}` });

  // The code as a customer types it: lowercase, with spaces.
  await searchBox.fill(trackingCode.toLowerCase().replace(/(\d{3})/g, "$1 "));
  await page.getByRole("button", { name: "Rastrear" }).click();
  await expect(parcel).toBeVisible();
  await expect(parcel.getByText("O que aconteceu com o pedido")).toBeVisible();
  await expect(parcel.getByText("Onde está agora:")).toBeVisible();
  await expect(parcel.getByText(/Demonstração/)).toBeVisible();

  await searchBox.fill(externalId);
  await page.getByRole("button", { name: "Rastrear" }).click();
  await expect(parcel).toBeVisible();

  // A code that is in no order of this reseller is read straight from the carrier.
  const manualCode = uniqueCorreiosCode("ZM");
  await searchBox.fill(manualCode);
  await page.getByRole("button", { name: "Rastrear" }).click();
  const manual = page.getByRole("region", { name: `Rastreio do código ${manualCode}` });
  await expect(manual).toBeVisible();
  await expect(manual.getByText(/Demonstração/)).toBeVisible();

  // The same text again looks again: the carrier may have scanned the parcel since.
  const lookAgain = page.waitForRequest(
    (request) => request.method() === "POST" && (request.postData() ?? "").includes(manualCode),
  );
  await page.getByRole("button", { name: "Rastrear" }).click();
  await lookAgain;
  await expect(manual).toBeVisible();

  await searchBox.fill("AB12");
  await page.getByRole("button", { name: "Rastrear" }).click();
  await expect(page.getByText(/Confira o que foi digitado/)).toBeVisible();

  // The orders on their way can be opened with a tap, and on a phone the result comes into view.
  await page.setViewportSize({ width: 390, height: 420 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const inTransit = page.getByRole("listitem").filter({ hasText: `Pedido ${externalId}` });
  await inTransit.getByRole("button", { name: "Ver rastreio" }).click();
  await expect(searchBox).toBeInViewport();
  await expect(parcel.getByRole("heading", { name: `Pedido ${externalId}` })).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page).toHaveURL(new RegExp(`trackOrder=${orderId}`));

  await page.getByRole("button", { name: "Operação" }).click();
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
  await page.getByRole("button", { name: "Operar pedido" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Acompanhar rastreio" }).click();
  await expect(page).toHaveURL(/view=tracking/);
  await expect(parcel).toBeVisible();
});
