import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  platformSettings,
  problemEvents,
  shipmentPayments,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ADMIN_USER, DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const PRODUCT = `Cesto de fibra e2e ${randomUUID().slice(0, 8)}`;
const orderIds: string[] = [];
const problemIds: string[] = [];

test.afterAll(async () => {
  // The Mercado Pago spec runs beside this one and owns the fee: only the rule goes back.
  await database
    .update(platformSettings)
    .set({ newSupplierProtection: false, newSupplierDeliveries: 5 });
  for (const problemId of problemIds) {
    await database.delete(problemEvents).where(eq(problemEvents.id, problemId));
  }
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

async function demoStore() {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenant?.id ?? ""));
  if (tenant === undefined || store === undefined) {
    throw new Error("Seed demo missing");
  }
  return { tenantId: tenant.id, storeId: store.id };
}

/** A paid sale of the demo reseller forwarded to the supplier: 2 baskets at R$ 40 each. */
async function forwardedSale(supplierId: string): Promise<{ orderId: string; shipmentId: string }> {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `CES-${randomUUID().slice(0, 8)}`,
      title: PRODUCT,
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 6,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) throw new Error("Product missing");
  const { tenantId, storeId } = await demoStore();
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeId,
      externalOrderId: `E2E-AS-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 19_800,
      buyerName: "Paula Ribeiro",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("Order missing");
  orderIds.push(order.id);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId,
      orderId: order.id,
      supplierProductId: product.id,
      title: "Cesto de fibra do revendedor",
      quantity: 2,
      unitPriceCents: 9_900,
      unitCostCents: 4_000,
    })
    .returning({ id: orderItems.id });
  if (item === undefined) throw new Error("Order item missing");
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId,
      orderId: order.id,
      supplierId,
      status: "forwarded",
      address: {
        recipient: "Paula Ribeiro",
        street: "Rua das Flores",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01001-000",
      },
      items: [{ orderItemId: item.id, title: PRODUCT, sku: "CES-E2E", quantity: 2 }],
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) throw new Error("Shipment missing");
  return { orderId: order.id, shipmentId: shipment.id };
}

/** Opens the supplier's Asaas account in the three steps and sends the documents. */
async function openApprovedAsaasAccount(page: Page): Promise<void> {
  await gotoHydrated(page, "/fornecedor/painel/recebimentos");
  const card = page.getByRole("region", { name: /Receber com proteção/ });
  await expect(card.getByText("Não aberta")).toBeVisible();
  await card.getByRole("button", { name: "Abrir minha conta no Asaas" }).click();
  const dialog = page.getByRole("dialog", { name: "Abrir conta no Asaas" });
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Informe os 14 caracteres do CNPJ")).toBeVisible();
  await dialog.getByLabel("Razão social").fill("Cestaria Proteção E2E Ltda");
  await dialog.getByRole("textbox", { name: "CNPJ" }).fill("11222333000181");
  await dialog.getByText("Limitada (LTDA)").click();
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Etapa 2 de 3: Contato e endereço")).toBeVisible();
  await dialog.getByLabel("E-mail").fill("financeiro@cestaria.test");
  await dialog.getByLabel("Celular com DDD").fill("11987654321");
  await dialog.getByLabel("CEP").fill("01001000");
  await dialog.getByLabel("Rua").fill("Praça da Sé");
  await dialog.getByLabel("Número").fill("100");
  await dialog.getByLabel("Bairro").fill("Sé");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByLabel("Quanto entra por mês (R$)").fill("15.000,00");
  await dialog.getByRole("button", { name: "Abrir minha conta" }).click();
  await expect(card.getByText("Falta enviar os documentos")).toBeVisible();

  const [asaasPage] = await Promise.all([
    page.context().waitForEvent("page"),
    card.getByRole("link", { name: "Enviar documentos no Asaas" }).click(),
  ]);
  await asaasPage.getByRole("button", { name: "Enviar documentos" }).click();
  await expect(asaasPage.getByText("Conta aprovada.")).toBeVisible();
  await asaasPage.close();
  await page.reload();
  await expect(card.getByText(/✓ Aprovada ·/)).toBeVisible();
}

test("o fornecedor abre a conta Asaas e o revendedor paga com o dinheiro protegido", async ({
  page,
  browser,
}) => {
  const email = await accounts.signUp(page, "Cestaria Proteção E2E");
  const supplierId = await giveTestBrand(database, email, "Cestaria Proteção E2E");
  const sale = await forwardedSale(supplierId);
  await openApprovedAsaasAccount(page);

  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await expect(
    reseller.getByText("Pagamento protegido: liberado ao fornecedor só depois da entrega"),
  ).toBeVisible();
  await reseller.getByRole("button", { name: "Pagar com Pix ou cartão" }).click();
  await expect(reseller.getByText("Total: R$ 80,00")).toBeVisible();
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await expect(reseller.getByText(/Fornecedor pago ·/)).toBeVisible();
  await expect(reseller.getByText("R$ 80,00 pagos por Pix no Asaas.")).toBeVisible();
  await reseller.context().close();

  const [payment] = await database
    .select()
    .from(shipmentPayments)
    .where(eq(shipmentPayments.shipmentId, sale.shipmentId));
  expect(payment).toMatchObject({ provider: "asaas", status: "approved", escrowStatus: "active" });
});

test("o fornecedor confirma a troca para o Asaas e pode desfazer", async ({ page }) => {
  const email = await accounts.signUp(page, "Cestaria Troca E2E");
  await giveTestBrand(database, email, "Cestaria Troca E2E");
  await openApprovedAsaasAccount(page);
  const mercadoPago = page.getByRole("region", { name: "Mercado Pago" });
  await mercadoPago.getByRole("link", { name: "Ligar conta Mercado Pago" }).click();
  await page.getByRole("button", { name: "Autorizar" }).click();
  await expect(mercadoPago.getByText(/Ligada ·/)).toBeVisible();

  const choice = page.getByRole("region", { name: "Para onde vão os próximos pagamentos" });
  await expect(choice.getByText("Mercado Pago", { exact: true })).toBeVisible();
  await choice.getByRole("button", { name: "Trocar para o Asaas" }).click();
  const confirm = page.getByRole("dialog", { name: "Trocar para o Asaas?" });
  await expect(confirm.getByText(/liberados para você 7 dias depois da entrega/)).toBeVisible();
  await confirm.getByRole("button", { name: "Trocar para o Asaas" }).click();
  await expect(choice.getByText("Asaas", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(choice.getByText("Mercado Pago", { exact: true })).toBeVisible();
  await expect(choice.getByRole("button", { name: "Trocar para o Asaas" })).toBeVisible();
});

/** A paid Asaas parcel whose money is held, and the problem asking the team to decide. */
async function heldPaymentProblem(supplierId: string): Promise<string> {
  const sale = await forwardedSale(supplierId);
  const [payment] = await database
    .insert(shipmentPayments)
    .values({
      shipmentId: sale.shipmentId,
      supplierId,
      provider: "asaas",
      status: "approved",
      amountCents: 8_000,
      platformFeeCents: 80,
      platformFeeBasisPoints: 100,
      providerPaymentId: `pay_${randomUUID()}`,
      paidAt: new Date(),
      escrowId: `esc_${randomUUID()}`,
      escrowStatus: "active",
      escrowExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: shipmentPayments.id });
  if (payment === undefined) throw new Error("Payment missing");
  const now = new Date();
  const [problem] = await database
    .insert(problemEvents)
    .values({
      service: "worker",
      area: "payments",
      event: "asaas.held_payment_needs_decision",
      message:
        "Pagamento protegido de R$ 80,00 precisa de uma decisão: o revendedor abriu uma devolução.",
      fingerprint: `e2e-${randomUUID()}`,
      context: { shipmentPaymentId: payment.id },
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning({ id: problemEvents.id });
  if (problem === undefined) throw new Error("Problem missing");
  problemIds.push(problem.id);
  return problem.id;
}

test("a equipe devolve ao revendedor um pagamento protegido sem regra", async ({
  page,
  browser,
}) => {
  const email = await accounts.signUp(page, "Cestaria Decisão E2E");
  const supplierId = await giveTestBrand(database, email, "Cestaria Decisão E2E");
  const problemId = await heldPaymentProblem(supplierId);

  const admin = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(admin, ADMIN_USER);
  await gotoHydrated(admin, `/admin/problemas/${problemId}`);
  await expect(
    admin.getByRole("heading", { name: "Pagamento protegido de R$ 80,00", exact: true }),
  ).toBeVisible();
  await expect(admin.getByText(/o Asaas libera ao fornecedor sozinho./)).toBeVisible();
  await admin.getByRole("button", { name: "Devolver ao revendedor" }).click();
  const confirm = admin.getByRole("dialog", { name: "Devolver o pagamento ao revendedor?" });
  await expect(confirm.getByText(/R\$\s80,00 voltam para o revendedor pelo Asaas/)).toBeVisible();
  await confirm.getByRole("button", { name: "Devolver ao revendedor" }).click();
  await expect(admin.getByText(/A equipe decidiu devolver ao revendedor/)).toBeVisible();
  await expect(admin.getByRole("button", { name: "Liberar ao fornecedor" })).toHaveCount(0);
  await admin.context().close();
});

test("o admin ajusta a proteção para fornecedores novos sem ligá-la", async ({ browser }) => {
  // Kept off: turning it on would hold the suppliers of the specs running beside this one.
  const admin = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(admin, ADMIN_USER);
  await gotoHydrated(admin, "/admin/configuracoes");
  const card = admin.getByRole("region", { name: "Proteção para fornecedores novos" });
  await expect(card.getByText("Desligada")).toBeVisible();
  const deliveries = card.getByLabel("Até completar quantas entregas");
  await deliveries.fill("0");
  await expect(card.getByText("Use de 1 a 1000 entregas (você digitou 0).")).toBeVisible();
  await expect(card.getByRole("button", { name: "Salvar regra" })).toBeDisabled();
  await deliveries.fill("7");
  await card.getByRole("button", { name: "Salvar regra" }).click();
  await expect(
    admin.getByText("Regra desligada: todo fornecedor escolhe como recebe."),
  ).toBeVisible();
  await expect(card.getByText("Desligada")).toBeVisible();
  await admin.context().close();
});
