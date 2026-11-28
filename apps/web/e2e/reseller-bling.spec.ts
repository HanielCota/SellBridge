import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  erpOAuthStates,
  member,
  orderItems,
  orders,
  orderShipments,
  resellerErpConnections,
  shipmentResellerInvoices,
  storeConnections,
  tenantProfile,
  user,
} from "@sellbridge/database/schema";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { eq, inArray } from "drizzle-orm";
import { forwardableProduct } from "./catalog-fixtures";
import { e2eDatabase } from "./database";
import { requireEnvironmentVariable } from "./environment";
import { completeOnboarding, gotoHydrated, signUp } from "./helpers";

// Venda à ordem: the reseller's own Bling issues its sale note. Only stand-ins answer: the web's
// Bling is the e2e stand-in, and the seeded tokens are no ciphertext, so the worker's Bling
// client fails before any call.
const database = e2eDatabase();
const STOPPED_PROBLEM =
  'Falta a forma de pagamento "Pix". Crie no seu Bling e peça para tentar de novo.';
const mercadoLivreStoreIds: string[] = [];

test.afterAll(async () => {
  if (mercadoLivreStoreIds.length > 0) {
    await database
      .update(storeConnections)
      .set({ status: "disconnected" })
      .where(inArray(storeConnections.id, mercadoLivreStoreIds));
  }
  await database.$client.end();
});

async function companyReseller(email: string): Promise<string> {
  const [row] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (row === undefined) throw new Error(`conta ${email} sem perfil`);
  await database
    .update(tenantProfile)
    .set({ cnpj: "11222333000181", companyName: "Revenda Bling Ltda", stateRegistration: "ISENTO" })
    .where(eq(tenantProfile.tenantId, row.tenantId));
  return row.tenantId;
}

async function connectBling(tenantId: string, issuingSince: Date | null) {
  await database.insert(resellerErpConnections).values({
    tenantId,
    provider: "bling",
    accessTokenEnc: "e2e-not-a-token",
    refreshTokenEnc: "e2e-not-a-token",
    expiresAt: new Date(Date.now() + 6 * 3_600_000),
    saleNotesEnabledAt: issuingSince,
  });
}

/** A Mercado Livre order with one venda à ordem parcel whose note the reseller's Bling stopped on. */
async function stoppedParcel(tenantId: string): Promise<string> {
  const cipher = createTokenCipher(requireEnvironmentVariable("TOKEN_ENCRYPTION_KEY"));
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "mercado_livre",
      // A shop of its own: a shop may be live only once, and other specs run alongside.
      externalShopId: `e2e-bling-${randomUUID().slice(0, 8)}`,
      shopName: "Loja Bling",
      accessTokenEnc: cipher.encrypt("mock-access-token"),
      refreshTokenEnc: cipher.encrypt("mock-refresh-token"),
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning({ id: storeConnections.id });
  if (store === undefined) throw new Error("Store missing");
  mercadoLivreStoreIds.push(store.id);
  const product = await forwardableProduct(database);
  if (product === undefined) throw new Error("Seed demo missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: `E2E-BLING-${randomUUID().slice(0, 8)}`,
      status: "paid",
      buyerName: "Juliana Costa",
      orderedAt: new Date(),
      totalCents: 9900,
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("Order missing");
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId,
      orderId: order.id,
      supplierProductId: product.id,
      title: product.title,
      quantity: 1,
      unitPriceCents: 9900,
      unitCostCents: product.costCents,
    })
    .returning({ id: orderItems.id });
  if (item === undefined) throw new Error("Item missing");
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId,
      orderId: order.id,
      supplierId: product.supplierId,
      status: "forwarded",
      address: {
        recipient: "Juliana Costa",
        street: "Rua das Flores",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01001-000",
      },
      items: [{ orderItemId: item.id, title: product.title, sku: product.sku, quantity: 1 }],
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) throw new Error("Shipment missing");
  await database.insert(shipmentResellerInvoices).values({
    shipmentId: shipment.id,
    tenantId,
    problem: STOPPED_PROBLEM,
    erpStoppedAt: new Date(),
  });
  return order.id;
}

test("a company reseller starts connecting its own Bling and comes back when it cancels", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revenda Bling Conecta");
  await completeOnboarding(page);
  const tenantId = await companyReseller(email);
  await gotoHydrated(page, "/integracoes");
  const section = page.getByRole("region", { name: "Bling", exact: true });
  await expect(section.getByRole("link", { name: "Conectar meu Bling" })).toBeVisible();

  const start = await page.request.get("/api/integracoes/bling/revenda", { maxRedirects: 0 });
  const consent = new URL(start.headers().location ?? "");
  const state = consent.searchParams.get("state") ?? "";
  const [saved] = await database
    .select({ tenantId: erpOAuthStates.tenantId })
    .from(erpOAuthStates)
    .where(eq(erpOAuthStates.state, state));
  await gotoHydrated(page, `/api/integracoes/bling/retorno?error=access_denied&state=${state}`);

  expect(start.status()).toBe(302);
  expect(consent.hostname).toContain("bling.com.br");
  expect(saved?.tenantId).toBe(tenantId);
  await expect(page).toHaveURL(/\/integracoes\?bling=cancelado/);
  await expect(page.getByText(/A conexão foi cancelada no Bling/)).toBeVisible();
});

test("the reseller chooses its own Bling with the likely operation and payment methods", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revenda Bling Escolhe");
  await completeOnboarding(page);
  const tenantId = await companyReseller(email);
  await connectBling(tenantId, null);
  await gotoHydrated(page, "/integracoes");
  const section = page.getByRole("region", { name: "Bling", exact: true });
  await expect(section.getByLabel("Natureza de operação da venda")).toContainText("Venda à ordem");
  await expect(section.getByLabel("Pix")).toContainText("Pix");

  await section.getByRole("radio", { name: "Pelo meu Bling (automático)" }).check();
  await section.getByRole("button", { name: "Salvar" }).click();

  await expect(section.getByText("Salvo")).toBeVisible();
  const [row] = await database
    .select({
      enabledAt: resellerErpConnections.saleNotesEnabledAt,
      settings: resellerErpConnections.saleNoteSettings,
    })
    .from(resellerErpConnections)
    .where(eq(resellerErpConnections.tenantId, tenantId));
  expect(row?.enabledAt).not.toBeNull();
  expect(row?.settings).toMatchObject({
    operationId: 503,
    cfopInState: "5120",
    cfopOutOfState: "6120",
    intermediaryCnpj: "03007331000141",
    paymentMethods: { pix: 601, credit_mastercard: 602 },
  });
});

test("a note the reseller's Bling stopped on shows why and goes back on retry", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revenda Bling Parada");
  await completeOnboarding(page);
  const tenantId = await companyReseller(email);
  // Issuing turned on after the parcel: the retry hands the note back to the marketplace read.
  await connectBling(tenantId, new Date(Date.now() + 3_600_000));
  const orderId = await stoppedParcel(tenantId);
  await gotoHydrated(page, `/pedidos/${orderId}`);
  const card = page.getByRole("region", { name: "Sua nota de venda" });
  await expect(card.getByText("Parada no seu Bling")).toBeVisible();
  await expect(card.getByText(STOPPED_PROBLEM)).toBeVisible();
  await expect(card.getByRole("button", { name: "Enviar o XML da nota" })).toBeVisible();

  await card.getByRole("button", { name: "Tentar de novo" }).click();

  await expect(card.getByText("Parada no seu Bling")).toHaveCount(0);
  const [note] = await database
    .select({ stoppedAt: shipmentResellerInvoices.erpStoppedAt })
    .from(shipmentResellerInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentResellerInvoices.shipmentId))
    .where(eq(orderShipments.orderId, orderId));
  expect(note?.stoppedAt).toBeNull();
});
