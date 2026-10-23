import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import {
  applyMarketplaceShipment,
  forwardOrder,
  upsertStoreConnection,
} from "@sellbridge/database/repositories";
import {
  member,
  orderItems,
  orders,
  returnClaims,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import {
  enableAdminMode,
  gotoHydrated,
  SIGN_UP_PASSWORD,
  signIn,
  signUp,
  signUpAsSupplier,
} from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const PHOTO_FIXTURE = fileURLToPath(new URL("./fixtures/avatar.png", import.meta.url));
const UNIT_COST_CENTS = 3500;

test.afterAll(async () => {
  await database.$client.end();
});

async function profileOf(email: string): Promise<{ userId: string; tenantId: string }> {
  const [row] = await database
    .select({ userId: user.id, tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (row === undefined) throw new Error(`Conta de teste sem perfil: ${email}`);
  return row;
}

/** The supplier's brand and one product, as the brand step and the panel would create them. */
async function supplierWithProduct(email: string, name: string) {
  const { tenantId } = await profileOf(email);
  const [supplier] = await database
    .insert(suppliers)
    .values({ name, niche: "Calçados", state: "SP", city: "Franca", organizationId: tenantId })
    .returning();
  if (supplier === undefined) throw new Error("Fornecedor não criado");
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId: supplier.id,
      sku: `RET-${randomUUID().slice(0, 8)}`,
      title: "Tênis Corrida - Preto 40",
      costCents: UNIT_COST_CENTS,
      suggestedPriceCents: 12_000,
      stock: 10,
    })
    .returning();
  if (product === undefined) throw new Error("Produto não criado");
  return product;
}

/** A paid sale of two units, forwarded to the supplier, that the marketplace then reads back. */
async function returnedOrder(tenantId: string, productId: string) {
  const store = await upsertStoreConnection(database, {
    tenantId,
    marketplace: "mock",
    externalShopId: randomUUID(),
    shopName: "Loja Devoluções",
    accessTokenEnc: "enc-access",
    refreshTokenEnc: "enc-refresh",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  const externalOrderId = `E2E-RET-${randomUUID().slice(0, 8)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId,
      status: "paid",
      totalCents: 24_000,
      buyerName: "Carla Mendes",
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("Pedido não criado");
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: productId,
    title: "Tênis Corrida - Preto 40",
    quantity: 2,
    unitPriceCents: 12_000,
    unitCostCents: UNIT_COST_CENTS,
  });
  await forwardOrder(database, tenantId, {
    orderId: order.id,
    address: {
      recipient: "Carla Mendes",
      street: "Rua das Flores",
      number: "100",
      complement: "",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      postalCode: "01001-000",
    },
    notes: "",
  });
  // What the tracking job does when Mercado Livre says the parcel came back.
  await applyMarketplaceShipment(database, tenantId, order.id, {
    status: "not_delivered",
    trackingStatus: "returned",
    buyerReturnDelivered: false,
    carrier: "Mercado Envios",
    trackingCode: "ML-RET-1",
  });
  return { orderId: order.id, externalOrderId };
}

async function claimTicketId(orderId: string): Promise<string> {
  const [claim] = await database
    .select({ ticketId: returnClaims.ticketId })
    .from(returnClaims)
    .where(eq(returnClaims.orderId, orderId));
  if (claim?.ticketId === undefined || claim.ticketId === null) {
    throw new Error("Devolução sem chamado");
  }
  return claim.ticketId;
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "pt-BR" });
  return context.newPage();
}

test("a returned parcel opens a claim the supplier answers with photos and the team credits", async ({
  browser,
}) => {
  test.slow();
  const supplierPage = await newPage(browser);
  const supplierEmail = await signUpAsSupplier(supplierPage, "Calçados Franca Devolução");
  const product = await supplierWithProduct(supplierEmail, "Calçados Franca Devolução");

  const resellerPage = await newPage(browser);
  const resellerEmail = await signUp(resellerPage, "Revendedora Devolução");
  const reseller = await profileOf(resellerEmail);
  const order = await returnedOrder(reseller.tenantId, product.id);
  const ticketId = await claimTicketId(order.orderId);

  // The supplier answers from its own support area, asked for photos, without the reseller's name.
  await gotoHydrated(supplierPage, `/suporte/${ticketId}`);
  const claimCard = supplierPage.getByRole("region", { name: "Devolução" });
  await expect(claimCard.getByText("Envie fotos do produto que voltou.")).toBeVisible();
  await expect(claimCard.getByText("Custo pago pelo revendedor: R$ 70,00")).toBeVisible();
  await expect(supplierPage.getByText("Revendedora Devolução")).toHaveCount(0);
  await supplierPage.getByLabel("Sua resposta").fill("Voltou com a sola gasta, segue a foto.");
  await supplierPage.locator('input[type="file"]').setInputFiles(PHOTO_FIXTURE);
  await supplierPage.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(supplierPage.getByText("Voltou com a sola gasta, segue a foto.")).toBeVisible();

  // A supervisor credits less than the supplier cost.
  const staffEmail = await signUp(await newPage(browser), "Supervisora Devoluções");
  await database.update(user).set({ role: "supervisor" }).where(eq(user.email, staffEmail));
  // A fresh session reads the new role.
  const staffPage = await newPage(browser);
  await signIn(staffPage, { email: staffEmail, password: SIGN_UP_PASSWORD });
  await enableAdminMode(staffPage);
  await gotoHydrated(staffPage, `/admin/chamados/${ticketId}`);
  const decision = staffPage.getByRole("region", { name: "Devolução · crédito do fornecedor" });
  const amount = decision.getByLabel("Valor do crédito ao revendedor");
  await expect(amount).toHaveValue("70,00");
  await amount.fill("90,00");
  await expect(decision.getByText(/O crédito vai até R\$\s70,00/)).toBeVisible();
  await amount.fill("50,00");
  await decision.getByRole("button", { name: "Creditar ao revendedor" }).click();
  await expect(decision.getByText(/R\$\s50,00 creditado ao revendedor/)).toBeVisible();

  // The reseller sees the credit on the returned order.
  await gotoHydrated(resellerPage, `/pedidos/${order.orderId}`);
  await expect(resellerPage.getByText(/Crédito do fornecedor: R\$\s50,00 creditado/)).toBeVisible();
});
