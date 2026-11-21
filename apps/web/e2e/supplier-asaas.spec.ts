import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { installProblemRecorder } from "@sellbridge/database/problem-recorder";
import { findSupplierPaymentAccount, listHeldPayments } from "@sellbridge/database/repositories";
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
  ticketOrders,
  tickets,
} from "@sellbridge/database/schema";
import { settleHeldPayment } from "@sellbridge/payments/asaas";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { and, eq, sql } from "drizzle-orm";
import { E2E_ASAAS_ENV } from "./asaas.fixture";
import { requireEnvironmentVariable } from "./environment";
import { ADMIN_USER, DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const PRODUCT = `Cesto de fibra e2e ${randomUUID().slice(0, 8)}`;
const orderIds: string[] = [];
const problemIds: string[] = [];

test.afterAll(async () => {
  // The fee test changes the platform settings: they go back to the defaults.
  await database.delete(platformSettings);
  // Tickets opened about the test orders go before the orders that pin them.
  for (const orderId of orderIds) {
    const pinned = await database
      .select({ ticketId: ticketOrders.ticketId })
      .from(ticketOrders)
      .where(eq(ticketOrders.orderId, orderId));
    for (const { ticketId } of pinned) {
      await database.delete(tickets).where(eq(tickets.id, ticketId));
    }
  }
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

/** Every charge the fake Asaas holds for a parcel, the removed ones too. */
async function asaasChargesOf(
  page: Page,
  reference: string,
): Promise<{ billingType: string; deleted: boolean }[]> {
  const response = await page.request.get(
    `/__e2e/asaas/test/cobrancas?externalReference=${encodeURIComponent(reference)}`,
  );
  const body: { data: { billingType: string; deleted: boolean }[] } = await response.json();
  return body.data;
}

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
  await expect(reseller.getByText(/boleto/i)).toHaveCount(0);
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await expect(reseller.getByText("Total: R$ 80,00")).toBeVisible();
  await expect(reseller.getByRole("button", { name: "Pagar com boleto" })).toHaveCount(0);
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

test("o revendedor troca o Pix pelo cartão e o Asaas nunca oferece boleto", async ({
  page,
  browser,
}) => {
  const email = await accounts.signUp(page, "Cestaria Cartão E2E");
  const supplierId = await giveTestBrand(database, email, "Cestaria Cartão E2E");
  const sale = await forwardedSale(supplierId);
  await openApprovedAsaasAccount(page);

  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await expect(reseller.getByText("Total: R$ 80,00")).toBeVisible();
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await reseller.getByRole("button", { name: "Pagar com cartão" }).click();
  await expect(reseller.getByText("Total: R$ 80,00")).toBeVisible();
  await expect(reseller.getByRole("button", { name: "Pagar com Pix" })).toHaveCount(0);
  await expect(reseller.getByRole("button", { name: "Pagar com boleto" })).toHaveCount(0);
  await reseller.getByRole("button", { name: "Pagar com cartão" }).click();
  await expect(reseller.getByText("R$ 80,00 pagos por cartão de crédito no Asaas.")).toBeVisible();
  await reseller.context().close();

  const [payment] = await database
    .select()
    .from(shipmentPayments)
    .where(eq(shipmentPayments.shipmentId, sale.shipmentId));
  const charges = await asaasChargesOf(page, payment?.id ?? "");
  expect(charges.map((charge) => [charge.billingType, charge.deleted])).toEqual([
    ["PIX", true],
    ["CREDIT_CARD", false],
  ]);
});

test("o admin define a taxa do SellBridge e ela vale no próximo pagamento", async ({
  page,
  browser,
}) => {
  const email = await accounts.signUp(page, "Cestaria Taxa E2E");
  const supplierId = await giveTestBrand(database, email, "Cestaria Taxa E2E");
  const sale = await forwardedSale(supplierId);
  await openApprovedAsaasAccount(page);

  const admin = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(admin, ADMIN_USER);
  await gotoHydrated(admin, "/admin/configuracoes");
  const fee = admin.getByLabel("Taxa (%)");
  await fee.fill("31");
  await fee.blur();
  await expect(admin.getByRole("alert")).toHaveText("A taxa vai de 0 a 30%. Diminua o valor.");
  await fee.fill("5");
  await expect(
    admin.getByText("Num pedido de R$ 100,00, o SellBridge fica com R$ 5,00."),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Salvar taxa" }).click();
  await expect(admin.getByText(/^5% · desde/)).toBeVisible();
  await admin.context().close();

  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await expect(reseller.getByText("Total: R$ 80,00")).toBeVisible();
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await expect(reseller.getByText(/Fornecedor pago ·/)).toBeVisible();
  await reseller.context().close();

  const [payment] = await database
    .select()
    .from(shipmentPayments)
    .where(eq(shipmentPayments.shipmentId, sale.shipmentId));
  expect(payment).toMatchObject({ platformFeeBasisPoints: 500, platformFeeCents: 400 });
});

test("o revendedor vê por que o pagamento protegido está voltando", async ({ page, browser }) => {
  const email = await accounts.signUp(page, "Cestaria Devolução E2E");
  const supplierId = await giveTestBrand(database, email, "Cestaria Devolução E2E");
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
      refundReason: "not_dispatched",
      refundRequestedAt: new Date(),
    })
    .returning({ id: shipmentPayments.id });
  if (payment === undefined) throw new Error("Payment missing");

  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await expect(reseller.getByText("Devolução em andamento")).toBeVisible();
  await expect(
    reseller.getByText(
      "O fornecedor não postou o envio no prazo. Estamos devolvendo R$ 80,00 para você pelo Asaas.",
    ),
  ).toBeVisible();

  await database
    .update(shipmentPayments)
    .set({ status: "refunded" })
    .where(eq(shipmentPayments.id, payment.id));
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await expect(reseller.getByText(/Pagamento devolvido ·/)).toBeVisible();
  await expect(
    reseller.getByText(
      "O fornecedor não postou o envio no prazo. Devolvemos R$ 80,00 para você pelo Asaas.",
    ),
  ).toBeVisible();
  await reseller.context().close();
});

/**
 * Runs the worker's settlement of one held payment against the fake Asaas, recording problems
 * the way the worker does. Returns what it decided and the problem it left for the team.
 */
async function settleLikeTheWorker(baseURL: string, shipmentId: string) {
  const recorder = installProblemRecorder(database, { service: "worker" });
  const held = (await listHeldPayments(database, { limit: 500 })).find(
    (candidate) => candidate.payment.shipmentId === shipmentId,
  );
  if (held === undefined) throw new Error("Held payment missing");
  const account = await findSupplierPaymentAccount(database, {
    supplierId: held.payment.supplierId,
    provider: "asaas",
  });
  if (account === null) throw new Error("Asaas account missing");
  const outcome = await settleHeldPayment(
    {
      database,
      cipher: createTokenCipher(requireEnvironmentVariable("TOKEN_ENCRYPTION_KEY")),
      settings: {
        apiUrl: new URL("/__e2e/asaas/v3", baseURL).href,
        apiKey: E2E_ASAAS_ENV.ASAAS_API_KEY,
        walletId: E2E_ASAAS_ENV.ASAAS_WALLET_ID,
        webhookToken: E2E_ASAAS_ENV.ASAAS_WEBHOOK_TOKEN,
      },
    },
    { account, held, now: new Date() },
  );
  await recorder.flush();
  recorder.stop();
  const [problem] = await database
    .select({ id: problemEvents.id, message: problemEvents.message })
    .from(problemEvents)
    .where(
      and(
        eq(problemEvents.event, "asaas.refund_refused"),
        sql`${problemEvents.context}->>'shipmentPaymentId' = ${held.payment.id}`,
      ),
    );
  if (problem !== undefined) problemIds.push(problem.id);
  return { outcome, problem };
}

test("a devolução de um Pix que o Asaas recusa vai para a equipe e o revendedor pede por chamado", async ({
  page,
  browser,
  baseURL,
}) => {
  const email = await accounts.signUp(page, "Cestaria Pix Manual E2E");
  const supplierId = await giveTestBrand(database, email, "Cestaria Pix Manual E2E");
  const sale = await forwardedSale(supplierId);
  await openApprovedAsaasAccount(page);

  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await reseller.getByRole("button", { name: "Pagar com Pix" }).click();
  await expect(reseller.getByText("R$ 80,00 pagos por Pix no Asaas.")).toBeVisible();

  // The parcel is cancelled before the supplier accepts: the rule gives the money back.
  await database
    .update(orderShipments)
    .set({ status: "cancelled" })
    .where(eq(orderShipments.id, sale.shipmentId));
  const { outcome, problem } = await settleLikeTheWorker(baseURL ?? "", sale.shipmentId);
  expect(outcome).toEqual({ kind: "refund_refused" });
  expect(problem?.message).toMatch(
    /^Devolução manual: o Asaas não devolveu sozinho R\$\s80,00 pagos por Pix\. Alguém da equipe devolve ao revendedor pelo Asaas até \d{2}\/\d{2}\/\d{4}/,
  );

  const admin = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(admin, ADMIN_USER);
  await gotoHydrated(admin, `/admin/problemas/${problem?.id}`);
  await expect(
    admin.getByRole("heading", { name: "Devolução manual de R$ 80,00", exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByText(/Devolva até \d{2}\/\d{2}\/\d{4}\. Depois dessa data/),
  ).toBeVisible();
  await expect(admin.getByText("Conta Asaas do fornecedor Cestaria Pix Manual E2E")).toBeVisible();
  await expect(admin.getByText(/Solicitar estorno/).first()).toBeVisible();
  await expect(admin.getByText(/ainda não abriu chamado sobre este pedido/)).toBeVisible();

  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await expect(
    reseller.getByText(
      /O envio foi cancelado\. Quem devolve os R\$\s80,00 é a equipe do SellBridge\./,
    ),
  ).toBeVisible();
  await expect(reseller.getByText(/não aceitou devolver/)).toHaveCount(0);
  await reseller.getByRole("link", { name: "Pedir a devolução à equipe" }).click();
  await expect(reseller.getByRole("heading", { name: "Novo chamado" })).toBeVisible();
  await expect(reseller.getByRole("textbox").first()).toHaveValue(
    /Quero de volta os R\$\s80,00 que paguei ao fornecedor no pedido E2E-AS-/,
  );
  await reseller.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(reseller).toHaveURL(/\/suporte\/[0-9a-f-]{36}/);
  const ticketUrl = new URL(reseller.url()).pathname;

  // With the ticket open, the order leads to it instead of opening a second one.
  await gotoHydrated(reseller, `/pedidos/${sale.orderId}`);
  await expect(reseller.getByRole("link", { name: "Pedir a devolução à equipe" })).toHaveCount(0);
  await expect(reseller.getByText(/Seu pedido de devolução já está com a equipe/)).toBeVisible();
  await expect(reseller.getByRole("link", { name: "Ver o chamado da devolução" })).toHaveAttribute(
    "href",
    new RegExp(`^${ticketUrl}`),
  );
  await admin.reload();
  await expect(admin.getByRole("link", { name: "Abrir o chamado do revendedor" })).toBeVisible();
  await reseller.context().close();
  await admin.context().close();
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
