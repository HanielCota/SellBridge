import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { organization, orderItems, orders, storeConnections } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { forwardableProduct } from "./catalog-fixtures";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const externalId = `E2E-LABEL-${randomUUID()}`;
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
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
      buyerName: "Comprador",
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
});

test.afterAll(async () => {
  if (orderId) await database.delete(orders).where(eq(orders.id, orderId));
  await database.$client.end();
});

const LABEL_FILES = [
  ["a text PDF", "shipping-label.pdf"],
  ["a photo", "shipping-label-photo.jpg"],
  ["a scanned PDF", "shipping-label-scan.pdf"],
] as const;

for (const [kind, fileName] of LABEL_FILES) {
  test(`fills the forward address from ${kind} of the shipping label`, async ({ page }) => {
    // The photo and the scan are read by OCR in the browser, which takes a few seconds.
    test.slow(fileName !== "shipping-label.pdf");
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/pedidos");
    await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
    await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
    await page.getByRole("button", { name: "Operar pedido" }).click();
    const dialog = page.getByRole("dialog", { name: "Operar pedido" });
    await dialog.getByLabel("Arquivo da etiqueta de envio").setInputFiles(fixture(fileName));
    for (const [label, value] of Object.entries(EXPECTED_ADDRESS))
      await expect(dialog.getByLabel(label, { exact: true })).toHaveValue(value, {
        timeout: 60_000,
      });
  });
}

const EXPECTED_ADDRESS = {
  Destinatário: "Maria da Silva",
  Rua: "Rua das Flores",
  Número: "123",
  Complemento: "Apto 45",
  Bairro: "Jardim Paulista",
  Cidade: "São Paulo",
  UF: "SP",
  CEP: "01310-100",
};
