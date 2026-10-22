import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { organization, orderItems, orders, storeConnections } from "@sellbridge/database/schema";
import { sealShippingAddress } from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { eq } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { forwardableProduct } from "./catalog-fixtures";
import { requireEnvironmentVariable } from "./environment";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const cipher = createTokenCipher(requireEnvironmentVariable("TOKEN_ENCRYPTION_KEY"));
const externalId = `E2E-ADDRESS-${randomUUID()}`;
const address = {
  recipient: "Ana Souza",
  street: "Rua das Palmeiras",
  number: "120",
  complement: "Casa 2",
  neighborhood: "Jardim América",
  city: "Campinas",
  state: "SP",
  postalCode: "13010-000",
};
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
      shippingAddressEnc: sealShippingAddress(cipher, address),
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

test("opens the forward form filled with the address the marketplace sent", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
  await page.getByRole("button", { name: "Operar pedido" }).click();
  const dialog = page.getByRole("dialog", { name: "Operar pedido" });
  await expect(dialog.getByText(/^Endereço preenchido pelo pedido d/)).toBeVisible();
  for (const [label, value] of Object.entries(EXPECTED_FIELDS))
    await expect(dialog.getByLabel(label, { exact: true })).toHaveValue(value);
  // The label reader is the fallback for orders that came without an address.
  await expect(dialog.getByRole("button", { name: "Preencher com a etiqueta" })).toHaveCount(0);
  // Still the reseller's to correct before forwarding.
  await dialog.getByLabel("Número", { exact: true }).fill("122");
  await expect(dialog.getByLabel("Número", { exact: true })).toHaveValue("122");
});

const EXPECTED_FIELDS = {
  Destinatário: address.recipient,
  Rua: address.street,
  Número: address.number,
  Complemento: address.complement,
  Bairro: address.neighborhood,
  Cidade: address.city,
  UF: address.state,
  CEP: address.postalCode,
};
