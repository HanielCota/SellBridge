import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import {
  forwardOrder,
  listNotificationEvents,
  updateShipment,
} from "@sellbridge/database/repositories";
import { CONTACT_DETAILS_REFUSED } from "@sellbridge/shared/schemas";
import {
  orderItems,
  orderShipments,
  orders,
  shipmentEvents,
  organization,
  storeConnections,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { forwardableProduct } from "./catalog-fixtures";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

/* MVP item 5, PR 2: the store and the supplier talk about an order inside SellBridge. */
const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const created: string[] = [];

test.afterAll(async () => {
  if (created.length > 0) {
    for (const orderId of created) await database.delete(orders).where(eq(orders.id, orderId));
  }
  await database.$client.end();
});

/** A paid order of the demo store, forwarded to an active platform supplier. */
async function forwardedOrder() {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  const [store] = tenant
    ? await database.select().from(storeConnections).where(eq(storeConnections.tenantId, tenant.id))
    : [];
  const product = await forwardableProduct(database);
  if (!tenant || !store || !product) throw new Error("Seed demo missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId: `MSG-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 9900,
      buyerName: "Maria Silva",
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("Order missing");
  created.push(order.id);
  await database.insert(orderItems).values({
    tenantId: tenant.id,
    orderId: order.id,
    supplierProductId: product.id,
    title: product.title,
    quantity: 1,
    unitPriceCents: 9900,
    unitCostCents: product.costCents,
  });
  const [link] = await forwardOrder(database, tenant.id, {
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
  return { order, link };
}

test("revendedor e fornecedor conversam pelas mensagens do pedido", async ({ browser, page }) => {
  const { order, link } = await forwardedOrder();
  const question = `Pode embalar com plástico bolha? ${Date.now()}`;
  const answer = `Posso sim, sai amanhã ${Date.now()}`;

  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos/${order.id}`);
  const resellerMessages = page.getByRole("region", { name: "Mensagens do pedido" });
  await resellerMessages.getByLabel("Mensagem para o fornecedor").fill(question);
  await resellerMessages.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(resellerMessages.getByText(question)).toBeVisible();
  await expect(resellerMessages.getByText("Você", { exact: true })).toBeVisible();

  const supplierContext = await browser.newContext({ locale: "pt-BR" });
  const supplier = await supplierContext.newPage();
  await gotoHydrated(supplier, `/fornecedor/pedido/${link.token}`);
  const supplierMessages = supplier.getByRole("region", { name: "Mensagens do pedido" });
  await expect(supplierMessages.getByText(question)).toBeVisible();
  await expect(supplierMessages.getByText("Revendedor", { exact: true })).toBeVisible();
  await supplierMessages.getByLabel("Mensagem para o revendedor").fill(answer);
  await supplierMessages.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(supplierMessages.getByText(answer)).toBeVisible();
  await supplierMessages
    .getByLabel("Mensagem para o revendedor")
    .fill("segue no insta @loja.atacado.oficial");
  await supplierMessages.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(supplierMessages.getByText(CONTACT_DETAILS_REFUSED)).toBeVisible();
  // A message is not a step: the history keeps only the steps.
  await expect(supplier.getByRole("list", { name: "Histórico do envio" })).not.toContainText(
    answer,
  );
  await supplierContext.close();

  await gotoHydrated(page, `/pedidos/${order.id}`);
  await expect(resellerMessages.getByText(answer)).toBeVisible();

  // Trying to take the talk outside: the phone never leaves the form, and nothing is saved.
  await resellerMessages
    .getByLabel("Mensagem para o fornecedor")
    .fill("me chama no zap: onze nove nove oito sete seis cinco quatro três dois um");
  await resellerMessages.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(resellerMessages.getByText(CONTACT_DETAILS_REFUSED)).toBeVisible();
  await expect(
    resellerMessages.getByRole("listitem").filter({ hasText: "me chama no zap" }),
  ).toHaveCount(0);
  const saved = await database
    .select({ note: shipmentEvents.note })
    .from(shipmentEvents)
    .where(eq(shipmentEvents.shipmentId, link.shipmentId));
  expect(saved.some((event) => event.note.includes("zap") || event.note.includes("@loja"))).toBe(
    false,
  );
  // The store's bell feed gets the supplier's message. Checked on the feed itself: the shared demo
  // store has over 20 open problems, and the bell keeps those first and cuts everything else.
  const [account] = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEMO_USER.email));
  const feed = await listNotificationEvents(database, {
    tenantId: order.tenantId,
    userId: account?.id ?? "",
    reviewableSince: new Date(0),
  });
  expect(feed.events).toContainEqual(
    expect.objectContaining({ kind: "order_message", entityId: order.id }),
  );
});

test("o fornecedor não escreve no envio de outro pedido nem por link expirado", async ({
  browser,
}) => {
  const first = await forwardedOrder();
  const second = await forwardedOrder();

  // A link only opens its own parcel, even when the request names another one.
  await expect(
    updateShipment(
      database,
      {
        shipmentId: second.link.shipmentId,
        status: "forwarded",
        carrier: "",
        trackingCode: "",
        trackingUrl: "",
        note: "Tentando escrever no pedido de outra loja",
      },
      { token: first.link.token },
    ),
  ).rejects.toThrow("Envio não encontrado");

  await database
    .update(orderShipments)
    .set({ supplierTokenExpiresAt: new Date(Date.now() - 60_000) })
    .where(eq(orderShipments.id, first.link.shipmentId));
  const context = await browser.newContext({ locale: "pt-BR" });
  const supplier = await context.newPage();
  await gotoHydrated(supplier, `/fornecedor/pedido/${first.link.token}`);
  await expect(supplier.getByRole("region", { name: "Mensagens do pedido" })).toHaveCount(0);
  await context.close();
});
