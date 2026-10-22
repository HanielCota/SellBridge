import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { DELIVERY_CONFIRMED_BY } from "@sellbridge/shared/schemas";
import { applyMarketplaceShipment, forwardOrder } from "@sellbridge/database/repositories";
import { and, eq } from "drizzle-orm";
import {
  organization,
  orderItems,
  orderShipments,
  orders,
  shipmentEvents,
  storeConnections,
  supplierProducts,
  suppliers,
} from "@sellbridge/database/schema";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { forwardableProduct } from "./catalog-fixtures";
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
  // Enter in an address field does not forward: only the button creates the supplier orders.
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await dialog.getByLabel("CEP", { exact: true }).press("Enter");
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(posts).toEqual([]);
  const link = dialog.getByLabel("Link do fornecedor");
  await expect(link).toHaveCount(0);
  await dialog.getByRole("button", { name: "Criar ordens e encaminhar aos fornecedores" }).click();
  await expect(link).toBeVisible();
  const supplierUrl = await link.inputValue();
  const supplierContext = await browser.newContext();
  const supplier = await supplierContext.newPage();
  await gotoHydrated(supplier, supplierUrl);
  await expect(supplier.getByRole("heading", { level: 1 })).toHaveText(/^Pedido /);
  for (const status of [
    "Marcar como aceito",
    "Marcar como em separação",
    "Marcar como pronto para envio",
  ])
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
  await supplier.getByRole("button", { name: "Marcar como enviado", exact: true }).click();
  await expect(supplier.getByText("Informe transportadora e código de rastreio")).toBeVisible();
  await supplier.getByLabel("Transportadora", { exact: true }).fill("Correios");
  await supplier.getByLabel("Código de rastreio", { exact: true }).fill("AB123456789BR");
  await supplier
    .getByLabel("Link de rastreio (opcional)")
    .fill("https://rastreamento.correios.com.br");
  await supplier.getByRole("button", { name: "Marcar como enviado", exact: true }).click();
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
  // The supplier's part ends at dispatch: delivery is not theirs to declare.
  await expect(
    supplier.getByRole("button", { name: "Marcar como entregue", exact: true }),
  ).toHaveCount(0);
  await expect(supplier.getByText(DELIVERY_CONFIRMED_BY)).toBeVisible();
  await supplierContext.close();

  // The reseller confirms it.
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalId);
  await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
  await page.getByRole("button", { name: "Operar pedido" }).click();
  const reopened = page.getByRole("dialog", { name: "Operar pedido" });
  await reopened.getByRole("button", { name: "Marcar como entregue", exact: true }).click();
  // Newest first: the delivery heads the history, with who confirmed it.
  const latest = reopened
    .getByRole("list", { name: "Histórico do envio" })
    .getByRole("listitem")
    .first();
  await expect(latest).toContainText("Entregue");
  await expect(latest).toContainText("por Revendedor");
  const [order] = await database.select().from(orders).where(eq(orders.id, orderId));
  expect(order?.status).toBe("delivered");
});

test("shows a parcel that failed and came back on the shipment timeline", async ({ page }) => {
  const returnedId = `E2E-RET-${randomUUID()}`;
  const [source] = await database.select().from(orders).where(eq(orders.id, orderId));
  if (!source) throw new Error("Order missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: source.tenantId,
      storeConnectionId: source.storeConnectionId,
      externalOrderId: returnedId,
      status: "paid",
      totalCents: 9900,
      buyerName: "Maria Silva",
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("Order missing");
  const [item] = await database.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (!item) throw new Error("Item missing");
  await database.insert(orderItems).values({ ...item, id: randomUUID(), orderId: order.id });
  try {
    await forwardOrder(database, order.tenantId, {
      orderId: order.id,
      address: {
        recipient: "Maria Silva",
        street: "Rua das Flores",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01001-000",
      },
      notes: "",
    });
    for (const [status, trackingStatus] of [
      ["not_delivered", "not_delivered"],
      ["not_delivered", "returned"],
    ] as const)
      await applyMarketplaceShipment(database, order.tenantId, order.id, {
        status,
        trackingStatus,
        buyerReturnDelivered: false,
        carrier: "Mercado Envios",
        trackingCode: "ML-E2E",
      });

    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/pedidos");
    await page.getByLabel("Buscar por pedido ou comprador").fill(returnedId);
    await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
    await page.getByRole("button", { name: "Operar pedido" }).click();
    const dialog = page.getByRole("dialog", { name: "Operar pedido" });
    const history = dialog.getByRole("list", { name: "Histórico do envio" }).getByRole("listitem");
    await expect(history.nth(0)).toContainText("Devolvido");
    await expect(history.nth(0)).toContainText("por Mercado Livre");
    await expect(history.nth(1)).toContainText("Não entregue");
    await expect(history.last()).toContainText("Aguardando fornecedor");
  } finally {
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

/** A copy of the seeded order, already forwarded: its supplier link is ready to open. */
async function forwardedOrder(prefix: string) {
  const externalOrderId = `${prefix}-${randomUUID()}`;
  const [source] = await database.select().from(orders).where(eq(orders.id, orderId));
  if (!source) throw new Error("Order missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: source.tenantId,
      storeConnectionId: source.storeConnectionId,
      externalOrderId,
      status: "paid",
      totalCents: 9900,
      buyerName: "Maria Silva",
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("Order missing");
  const [item] = await database.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (!item) throw new Error("Item missing");
  await database.insert(orderItems).values({ ...item, id: randomUUID(), orderId: order.id });
  const [link] = await forwardOrder(database, order.tenantId, {
    orderId: order.id,
    address: {
      recipient: "Maria Silva",
      street: "Rua das Flores",
      number: "10",
      complement: "",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      postalCode: "01001-000",
    },
    notes: "",
  });
  if (!link) throw new Error("Link missing");
  return { order, link, externalOrderId };
}

test("the reseller learns a supplier cancelled and re-forwards the parcel", async ({
  page,
  browser,
}) => {
  const { order, link, externalOrderId: cancelledId } = await forwardedOrder("E2E-CAN");
  try {
    // The supplier refuses through the link, confirming with a reason.
    const supplierContext = await browser.newContext();
    const supplier = await supplierContext.newPage();
    await gotoHydrated(supplier, `/fornecedor/pedido/${link.token}`);
    await expect(supplier.getByText(/CEP \d/)).toBeVisible();
    await supplier.getByRole("button", { name: "Cancelar envio" }).click();
    const confirm = supplier.getByRole("dialog", { name: "Cancelar este envio?" });
    await confirm.getByLabel("Motivo do cancelamento").fill("Produto em falta no depósito");
    await confirm.getByRole("button", { name: "Cancelar envio" }).click();
    await expect(
      supplier.getByRole("list", { name: "Histórico do envio" }).getByRole("listitem").first(),
    ).toContainText("Cancelado");
    // The parcel is over: the link keeps its history but no longer shows the buyer's address.
    await expect(supplier.getByText(/CEP \d/)).toHaveCount(0);
    await expect(supplier.getByRole("button", { name: /^Imprimir/ })).toHaveCount(0);
    await supplierContext.close();

    // The reseller sees it in the bell, under problems, with the reason.
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/pedidos");
    await page.getByRole("button", { name: /^Avisos/ }).click();
    await page.getByRole("tab", { name: /Problemas/ }).click();
    const notice = page.getByText(`cancelou o envio do pedido #${cancelledId}`);
    await expect(notice).toBeVisible();
    await expect(page.getByText("Motivo: Produto em falta no depósito.")).toBeVisible();
    await page.keyboard.press("Escape");

    // And sends it to the supplier again: a new link that opens the parcel from the start.
    await page.getByLabel("Buscar por pedido ou comprador").fill(cancelledId);
    await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
    await page.getByRole("button", { name: "Operar pedido" }).click();
    const dialog = page.getByRole("dialog", { name: "Operar pedido" });
    await dialog.getByRole("button", { name: "Reencaminhar ao fornecedor" }).click();
    const newLink = dialog.getByLabel("Link do fornecedor");
    await expect(newLink).toBeVisible();
    const supplierUrl = await newLink.inputValue();
    expect(supplierUrl).not.toContain(link.token);
    const again = await browser.newContext();
    const reopened = await again.newPage();
    await gotoHydrated(reopened, supplierUrl);
    await expect(
      reopened.getByRole("button", { name: "Marcar como aceito", exact: true }),
    ).toBeVisible();
    await again.close();
  } finally {
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

test("a supplier's tap on Cancelar envio asks first and needs a reason", async ({ browser }) => {
  const { order, link } = await forwardedOrder("E2E-CANASK");
  const context = await browser.newContext();
  const supplier = await context.newPage();
  const history = supplier.getByRole("list", { name: "Histórico do envio" });
  try {
    await gotoHydrated(supplier, `/fornecedor/pedido/${link.token}`);
    // Always available, with nothing typed: the reason is asked in the dialog.
    const cancel = supplier.getByRole("button", { name: "Cancelar envio" });
    await expect(cancel).toBeEnabled();
    await cancel.click();
    const confirm = supplier.getByRole("dialog", { name: "Cancelar este envio?" });
    await expect(confirm).toContainText("A loja é avisada com o motivo");
    // Backing out cancels nothing.
    await confirm.getByRole("button", { name: "Voltar" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(history.getByRole("listitem").first()).not.toContainText("Cancelado");

    // The step note typed before opens as the reason; erased, the dialog refuses to go on.
    await supplier.getByLabel("Observação da etapa (opcional)").fill("Sem estoque da cor pedida");
    await cancel.click();
    const reason = confirm.getByLabel("Motivo do cancelamento");
    await expect(reason).toHaveValue("Sem estoque da cor pedida");
    await reason.fill("");
    await confirm.getByRole("button", { name: "Cancelar envio" }).click();
    await expect(confirm.getByRole("alert")).toHaveText("Informe o motivo do cancelamento");
    // Refused before reaching the server: the dialog stays open (the page behind it is inert).
    await expect(confirm).toBeVisible();

    await reason.fill("Sem estoque da cor pedida");
    await confirm.getByRole("button", { name: "Cancelar envio" }).click();
    await expect(history.getByRole("listitem").first()).toContainText("Cancelado");
    await expect(history.getByRole("listitem").first()).toContainText("Sem estoque da cor pedida");
  } finally {
    await context.close();
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

test("the reseller confirms before cancelling a supplier's parcel", async ({ page }) => {
  const { order, externalOrderId } = await forwardedOrder("E2E-CANRES");
  try {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/pedidos");
    await page.getByLabel("Buscar por pedido ou comprador").fill(externalOrderId);
    await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
    await page.getByRole("button", { name: "Operar pedido" }).click();
    const panel = page.getByRole("dialog", { name: "Operar pedido" });
    await panel.getByRole("button", { name: "Cancelar envio" }).click();
    const confirm = page.getByRole("dialog", { name: /^Cancelar o envio de .+\?$/ });
    await expect(confirm).toContainText("reencaminhar");
    await confirm.getByLabel("Motivo do cancelamento").fill("Comprador desistiu antes do envio");
    await confirm.getByRole("button", { name: "Cancelar envio" }).click();
    await expect(
      panel.getByRole("list", { name: "Histórico do envio" }).getByRole("listitem").first(),
    ).toContainText("Cancelado");
  } finally {
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

test("an empty order message says what is missing instead of staying grey", async ({ browser }) => {
  const { order, link } = await forwardedOrder("E2E-OCC");
  const context = await browser.newContext();
  const supplier = await context.newPage();
  try {
    await gotoHydrated(supplier, `/fornecedor/pedido/${link.token}`);
    const send = supplier.getByRole("button", { name: "Enviar mensagem" });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(supplier.getByText("Escreva a mensagem antes de enviar")).toBeVisible();
  } finally {
    await context.close();
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

test("the supplier link opens with the brand and the order as its title", async ({ browser }) => {
  const { order, link, externalOrderId } = await forwardedOrder("E2E-LINK");
  const context = await browser.newContext();
  const supplier = await context.newPage();
  try {
    await gotoHydrated(supplier, `/fornecedor/pedido/${link.token}`);
    const header = supplier.getByRole("banner");
    await expect(header.locator("[data-slot='brand-logo']")).toBeVisible();
    await expect(header).toContainText("Portal do fornecedor");
    await expect(supplier.getByRole("heading", { level: 1 })).toHaveText(
      `Pedido ${externalOrderId}`,
    );
  } finally {
    await context.close();
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

test("a parcel of an order on hold warns the supplier and offers no next step", async ({
  browser,
}) => {
  const { order, link } = await forwardedOrder("E2E-HOLD");
  // The marketplace put the payment on hold after the parcel was forwarded.
  await database.update(orders).set({ status: "pending" }).where(eq(orders.id, order.id));
  const context = await browser.newContext();
  const supplier = await context.newPage();
  try {
    await gotoHydrated(supplier, `/fornecedor/pedido/${link.token}`);
    const warning = supplier.getByRole("alert");
    await expect(warning).toContainText("Pedido sem liberação para envio");
    await expect(warning).toContainText("Fale com o revendedor");
    await expect(
      supplier.getByRole("button", { name: "Marcar como aceito", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

test("a parcel past its delivery estimate shows as late in operations, the order and the bell", async ({
  page,
}) => {
  const { order, link, externalOrderId } = await forwardedOrder("E2E-LATE");
  // The bell lists the 10 delays that started first. The shared demo seller carries parcels
  // late on accept or dispatch from other runs, so a parcel late for three days fell out of the
  // list; a delivery estimate older than any of them keeps this one in it, whatever is there.
  await database
    .update(orderShipments)
    .set({ status: "shipped", estimatedDeliveryAt: new Date("2000-01-03T12:00:00Z") })
    .where(eq(orderShipments.id, link.shipmentId));
  try {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/pedidos");
    await page.getByLabel("Buscar por pedido ou comprador").fill(externalOrderId);
    await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
    await expect(page.getByText("Entrega atrasada").first()).toBeVisible();

    await gotoHydrated(page, `/pedidos/${order.id}`);
    await expect(page.getByText("Entrega prevista").first()).toBeVisible();
    await expect(page.getByText("Entrega atrasada").first()).toBeVisible();

    await page.getByRole("button", { name: /^Avisos/ }).click();
    await page.getByRole("tab", { name: /Problemas/ }).click();
    await expect(page.getByText(`Entrega atrasada no pedido #${externalOrderId}`)).toBeVisible();
  } finally {
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

test("forwarding e-mails the link to a supplier with an order e-mail", async ({ page }) => {
  const externalOrderId = `E2E-MAIL-${randomUUID()}`;
  const [source] = await database.select().from(orders).where(eq(orders.id, orderId));
  const [item] = await database.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (!source || !item?.supplierProductId) throw new Error("Order missing");
  const [product] = await database
    .select({ supplierId: supplierProducts.supplierId })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, item.supplierProductId));
  if (!product) throw new Error("Product missing");
  const [supplier] = await database
    .select({ contactEmail: suppliers.contactEmail })
    .from(suppliers)
    .where(eq(suppliers.id, product.supplierId));
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: source.tenantId,
      storeConnectionId: source.storeConnectionId,
      externalOrderId,
      status: "paid",
      totalCents: 9900,
      buyerName: "Maria Silva",
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("Order missing");
  await database.insert(orderItems).values({ ...item, id: randomUUID(), orderId: order.id });
  await database
    .update(suppliers)
    .set({ contactEmail: "pedidos@fornecedor-e2e.test" })
    .where(eq(suppliers.id, product.supplierId));
  try {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/pedidos");
    await page.getByLabel("Buscar por pedido ou comprador").fill(externalOrderId);
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
    await dialog
      .getByRole("button", { name: "Criar ordens e encaminhar aos fornecedores" })
      .click();
    await expect(dialog.getByLabel("Link do fornecedor")).toBeVisible();
    await expect(dialog.getByText("Enviamos este link para o e-mail do fornecedor.")).toBeVisible();
  } finally {
    await database
      .update(suppliers)
      .set({ contactEmail: supplier?.contactEmail ?? null })
      .where(eq(suppliers.id, product.supplierId));
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});

test("a parcel the supplier did not accept in time shows as late, and the supplier sees its times", async ({
  page,
  browser,
}) => {
  const { order, link, externalOrderId } = await forwardedOrder("E2E-ACCEPT");
  await database
    .update(shipmentEvents)
    .set({ createdAt: new Date(Date.now() - 25 * 3_600_000) })
    .where(
      and(eq(shipmentEvents.shipmentId, link.shipmentId), eq(shipmentEvents.status, "forwarded")),
    );
  try {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/pedidos");
    await page.getByLabel("Buscar por pedido ou comprador").fill(externalOrderId);
    await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
    await expect(page.getByText("Aceite atrasado").first()).toBeVisible();
    await gotoHydrated(page, `/pedidos/${order.id}`);
    await expect(page.getByText("Aceite atrasado").first()).toBeVisible();

    const supplierContext = await browser.newContext();
    const supplier = await supplierContext.newPage();
    await gotoHydrated(supplier, `/fornecedor/pedido/${link.token}`);
    await expect(supplier.getByText("Aceite até")).toBeVisible();
    await expect(supplier.getByText("Despachar até")).toBeVisible();
    await supplierContext.close();
  } finally {
    await database.delete(orders).where(eq(orders.id, order.id));
  }
});
