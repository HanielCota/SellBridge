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
import { eq } from "drizzle-orm";
import { forwardableProduct } from "./catalog-fixtures";
import { e2eDatabase } from "./database";
import { completeOnboarding, gotoHydrated, signUp } from "./helpers";

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

async function insertOrder(tenantId: string) {
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "mock",
      externalShopId: `shop-${randomUUID().slice(0, 8)}`,
      shopName: "Loja Venda à Ordem",
      accessTokenEnc: null,
      refreshTokenEnc: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning({ id: storeConnections.id });
  if (store === undefined) throw new Error("Store missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: `E2E-ORDEM-${randomUUID().slice(0, 8)}`,
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
async function seedParcelWaitingForNote(email: string): Promise<string> {
  const tenantId = await tenantOf(email);
  await database
    .update(tenantProfile)
    .set({ cnpj: RESELLER_CNPJ, companyName: "Revenda Ordem Ltda", stateRegistration: "ISENTO" })
    .where(eq(tenantProfile.tenantId, tenantId));
  const product = await forwardableProduct(database);
  if (product === undefined) throw new Error("Seed demo missing");
  const orderId = await insertOrder(tenantId);
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

test.afterAll(async () => {
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
