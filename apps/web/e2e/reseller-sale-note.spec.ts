import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  member,
  orderItems,
  orders,
  orderShipments,
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
import {
  completeOnboarding,
  enableAdminMode,
  gotoHydrated,
  SIGN_UP_PASSWORD,
  signIn,
  signUp,
} from "./helpers";
import {
  E2E_MERCADO_LIVRE_NOTE_ORDER_PREFIX,
  E2E_MERCADO_LIVRE_NOTE_SELLER_ID,
} from "./mercado-livre.fixture";

// Venda à ordem: the reseller's company issues the buyer's note; the order asks for it.
const database = e2eDatabase();
const RESELLER_CNPJ = "11222333000181";
/** An NF-e of CNPJ 11.222.333/0001-81, series 1, number 4821. */
const RESELLER_KEY = "35261111222333000181550010000048211123456789";
/** An NF-e of another company (CNPJ 21.611.372/0003-96). */
const OTHER_COMPANY_KEY = "35261121611372000396550010000000101876543210";
const MARKETPLACE_PROBLEM =
  "A nota anexada ao pedido no marketplace não serve. Esta nota foi emitida pelo CNPJ 21.611.372/0003-96.";

async function tenantOf(email: string): Promise<string> {
  const [row] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (row === undefined) throw new Error(`conta ${email} sem perfil`);
  return row.tenantId;
}

/** A Mercado Livre store on `shopId`, with a real ciphertext the server opens. */
function mercadoLivreStore(shopId: string) {
  const cipher = createTokenCipher(requireEnvironmentVariable("TOKEN_ENCRYPTION_KEY"));
  return {
    marketplace: "mercado_livre" as const,
    externalShopId: shopId,
    accessTokenEnc: cipher.encrypt("mock-access-token"),
    refreshTokenEnc: cipher.encrypt("mock-refresh-token"),
    externalOrderId: `${E2E_MERCADO_LIVRE_NOTE_ORDER_PREFIX}${Date.now()}`,
  };
}

/**
 * A Mercado Livre order on the stand-in's note seller, or on a shop of its own when the spec
 * never asks Mercado Livre about it: a shop may be live only once, and specs run alongside.
 */
type OrderChannel = "mock" | "mercado_livre" | "mercado_livre_own_shop";

async function insertOrder(tenantId: string, channel: OrderChannel = "mock") {
  const shopId =
    channel === "mercado_livre_own_shop"
      ? `e2e-ml-${randomUUID().slice(0, 8)}`
      : E2E_MERCADO_LIVRE_NOTE_SELLER_ID;
  const mercadoLivre = channel === "mock" ? null : mercadoLivreStore(shopId);
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: mercadoLivre?.marketplace ?? "mock",
      externalShopId: mercadoLivre?.externalShopId ?? `shop-${randomUUID().slice(0, 8)}`,
      shopName: "Loja Venda à Ordem",
      accessTokenEnc: mercadoLivre?.accessTokenEnc ?? null,
      refreshTokenEnc: mercadoLivre?.refreshTokenEnc ?? null,
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning({ id: storeConnections.id });
  if (store === undefined) throw new Error("Store missing");
  if (mercadoLivre !== null) {
    mercadoLivreStoreIds.push(store.id);
  }
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: mercadoLivre?.externalOrderId ?? `E2E-ORDEM-${randomUUID().slice(0, 8)}`,
      status: "paid",
      buyerName: "Juliana Costa",
      orderedAt: new Date(),
      totalCents: 9900,
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("Order missing");
  return order.id;
}

/** A company reseller's forwarded parcel whose sale note the job is still looking for. */
async function seedParcelWaitingForNote(
  email: string,
  channel: OrderChannel = "mock",
): Promise<string> {
  const tenantId = await tenantOf(email);
  await database
    .update(tenantProfile)
    .set({ cnpj: RESELLER_CNPJ, companyName: "Revenda Ordem Ltda", stateRegistration: "ISENTO" })
    .where(eq(tenantProfile.tenantId, tenantId));
  const product = await forwardableProduct(database);
  if (product === undefined) throw new Error("Seed demo missing");
  const orderId = await insertOrder(tenantId, channel);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId,
      orderId,
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
      orderId,
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
    checks: 3,
    problem: MARKETPLACE_PROBLEM,
  });
  return orderId;
}

function noteCard(page: Page) {
  return page.getByRole("region", { name: "Sua nota de venda" });
}

/** Mercado Livre stores this spec connected: the stand-in's shop may be live only once. */
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

test("a company reseller pastes the key of its own sale note on the order", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revenda Venda Ordem");
  await completeOnboarding(page);
  const orderId = await seedParcelWaitingForNote(email);
  await gotoHydrated(page, `/pedidos/${orderId}`);
  const card = noteCard(page);
  await expect(card.getByText("Esperando a sua nota")).toBeVisible();
  await expect(card.getByText(MARKETPLACE_PROBLEM, { exact: false })).toBeVisible();
  const field = card.getByLabel("Chave de acesso da sua nota (44 números)");

  await field.fill("3526 1111");
  await card.getByRole("button", { name: "Salvar chave" }).click();
  await expect(
    card.getByText("A chave de acesso tem 44 números, e esta tem 8. Copie de novo da nota."),
  ).toBeVisible();
  await field.fill(OTHER_COMPANY_KEY);
  await card.getByRole("button", { name: "Salvar chave" }).click();
  await expect(
    card.getByText(/Use a nota emitida pela sua empresa, CNPJ 11\.222\.333/),
  ).toBeVisible();
  await field.fill(RESELLER_KEY.replace(/(\d{4})/g, "$1 ").trim());
  await card.getByRole("button", { name: "Salvar chave" }).click();

  await expect(card.getByText(/Nota recebida · /)).toBeVisible();
  await expect(card.getByText("Nota 4821 · série 1")).toBeVisible();
  await expect(card.getByText("Chave informada por você")).toBeVisible();
  await expect(card.getByLabel("Chave de acesso da sua nota (44 números)")).toHaveCount(0);
});

/** The authorized NF-e of RESELLER_KEY, as the reseller's system downloads it. */
function authorizedNfeXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
    `<NFe><infNFe versao="4.00" Id="NFe${RESELLER_KEY}"><ide><nNF>4821</nNF></ide></infNFe></NFe>`,
    `<protNFe versao="4.00"><infProt><chNFe>${RESELLER_KEY}</chNFe><cStat>100</cStat></infProt></protNFe>`,
    "</nfeProc>",
  ].join("");
}

test("on Mercado Livre the reseller sends its note's XML and SellBridge passes it on", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revenda XML Ordem");
  await completeOnboarding(page);
  const orderId = await seedParcelWaitingForNote(email, "mercado_livre");
  await gotoHydrated(page, `/pedidos/${orderId}`);
  const card = noteCard(page);
  const file = card.getByLabel("Arquivo XML da nota (.xml)");
  const labelBefore = await page.request.get(`/api/pedidos/${orderId}/etiqueta`);
  expect(labelBefore.status()).toBe(409);
  expect(await labelBefore.text()).toContain("espera a nota de venda do revendedor");
  await expect(card.getByRole("button", { name: "Enviar o XML da nota" })).toBeVisible();

  await file.setInputFiles({
    name: "danfe.pdf.xml",
    mimeType: "application/xml",
    buffer: Buffer.from("<html>danfe</html>"),
  });
  await expect(card.getByText(/não é o XML de uma NF-e autorizada/)).toBeVisible();
  await file.setInputFiles({
    name: "nota-4821.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(authorizedNfeXml()),
  });

  await expect(card.getByText(/Nota recebida · /)).toBeVisible();
  await expect(card.getByText("XML enviado por você ao Mercado Livre")).toBeVisible();
  await expect(card.getByLabel("Chave de acesso da sua nota (44 números)")).toHaveCount(0);
  const labelAfter = await page.request.get(`/api/pedidos/${orderId}/etiqueta`);
  expect(await labelAfter.text()).toContain("espera a nota de remessa do fornecedor");
});

test("a supervisor releases a stuck venda à ordem label with a reason, and it comes out", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const email = await signUp(page, "Revenda Etiqueta Presa");
  await completeOnboarding(page);
  const orderId = await seedParcelWaitingForNote(email, "mercado_livre_own_shop");
  const [parcel] = await database
    .select({ id: orderShipments.id })
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId));
  const held = await page.request.get(`/api/pedidos/${orderId}/etiqueta`);
  expect(await held.text()).toContain("fale com o suporte do SellBridge");
  const staffPage = await browser.newPage();
  const staffEmail = await signUp(staffPage, "Supervisora Etiqueta");
  await database.update(user).set({ role: "supervisor" }).where(eq(user.email, staffEmail));
  const supervisor = await browser.newPage();
  await signIn(supervisor, { email: staffEmail, password: SIGN_UP_PASSWORD });
  await enableAdminMode(supervisor);
  await gotoHydrated(supervisor, `/admin/envios?shipment=${parcel?.id ?? ""}`);
  const label = supervisor.getByRole("region", { name: "Etiqueta da venda à ordem" });
  await expect(label.getByText(/espera a nota de venda do revendedor/)).toBeVisible();

  await label
    .getByLabel("Motivo da liberação")
    .fill("Revendedor sem acesso ao sistema de notas hoje");
  await label.getByRole("button", { name: "Liberar etiqueta" }).click();

  await expect(label.getByText("Etiqueta liberada pela equipe")).toBeVisible();
  await expect(
    label.getByText("Motivo: Revendedor sem acesso ao sistema de notas hoje"),
  ).toBeVisible();
  const released = await page.request.get(`/api/pedidos/${orderId}/etiqueta`);
  expect(await released.text()).not.toContain("venda à ordem espera");
  await staffPage.close();
  await supervisor.close();
});
