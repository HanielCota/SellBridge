import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { eq } from "drizzle-orm";
import {
  organization,
  orderItems,
  orders,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { requireEnvironmentVariable } from "./environment";
const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
let orderId = "";
const externalId = `E2E-FUL-${randomUUID()}`;
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
});
test.afterAll(async () => {
  if (orderId) await database.delete(orders).where(eq(orders.id, orderId));
  await database.$client.end();
});
test("reseller forwards an order and an unauthenticated supplier completes preparation and shipping", async ({
  page,
  browser,
}) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
  await page.getByRole("button", { name: "Operar pedido" }).click();
  const dialog = page.getByRole("dialog", { name: "Operar pedido" });
  for (const [label, value] of Object.entries({
    Destinatário: "Maria Silva",
    Rua: "Rua das Flores",
    Número: "10",
    Bairro: "Centro",
    Cidade: "São Paulo",
    UF: "SP",
    CEP: "01001-000",
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Criar ordens e encaminhar aos fornecedores" }).click();
  const link = dialog.getByLabel("Link do fornecedor");
  await expect(link).toBeVisible();
  const supplierUrl = await link.inputValue();
  const supplierContext = await browser.newContext();
  const supplier = await supplierContext.newPage();
  await gotoHydrated(supplier, supplierUrl);
  await expect(supplier.getByRole("heading", { name: "Ordem de fornecimento" })).toBeVisible();
  for (const status of ["Aceito", "Em separação", "Pronto para envio"])
    await supplier.getByRole("button", { name: status, exact: true }).click();
  await supplier.screenshot({ path: test.info().outputPath("supplier-order.png"), fullPage: true });
  await supplier.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => supplier.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await supplier.screenshot({
    path: test.info().outputPath("supplier-order-mobile.png"),
    fullPage: true,
  });
  await supplier.getByRole("button", { name: "Enviado", exact: true }).click();
  await expect(supplier.getByText("Informe transportadora e código de rastreio")).toBeVisible();
  await supplier.getByLabel("Transportadora", { exact: true }).fill("Correios");
  await supplier.getByLabel("Código de rastreio", { exact: true }).fill("AB123456789BR");
  await supplier
    .getByLabel("Link de rastreio (HTTPS, opcional)")
    .fill("https://rastreamento.correios.com.br");
  await supplier.getByRole("button", { name: "Enviado", exact: true }).click();
  await expect(supplier.getByRole("link", { name: "Consultar rastreio" })).toHaveAttribute(
    "href",
    "https://rastreamento.correios.com.br",
  );
  const popupPromise = supplier.waitForEvent("popup");
  await supplier.getByRole("button", { name: "Imprimir etiqueta de identificação" }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Etiqueta de identificação" })).toBeVisible();
  await expect(popup.getByText("Maria Silva", { exact: true })).toBeVisible();
  await popup.close();
  await supplier.getByRole("button", { name: "Entregue", exact: true }).click();
  await expect(supplier.getByRole("button", { name: "Entregue", exact: true })).toHaveCount(0);
  const [order] = await database.select().from(orders).where(eq(orders.id, orderId));
  expect(order?.status).toBe("delivered");
  await supplierContext.close();
});
