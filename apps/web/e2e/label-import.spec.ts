import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import {
  organization,
  orderItems,
  orders,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { requireEnvironmentVariable } from "./environment";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const externalId = `E2E-LABEL-${randomUUID()}`;
const labelPdf = fileURLToPath(new URL("./fixtures/shipping-label.pdf", import.meta.url));
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
  const [product] = await database.select().from(supplierProducts).limit(1);
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

test("fills the forward address from a shipping label PDF", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
  await page.getByRole("button", { name: "Operar pedido" }).click();
  const dialog = page.getByRole("dialog", { name: "Operar pedido" });
  await dialog.getByLabel("Arquivo da etiqueta de envio").setInputFiles(labelPdf);
  const expected = {
    Destinatário: "Maria da Silva",
    Rua: "Rua das Flores",
    Número: "123",
    Complemento: "Apto 45",
    Bairro: "Jardim Paulista",
    Cidade: "São Paulo",
    UF: "SP",
    CEP: "01310-100",
  };
  for (const [label, value] of Object.entries(expected))
    await expect(dialog.getByLabel(label, { exact: true })).toHaveValue(value);
});
