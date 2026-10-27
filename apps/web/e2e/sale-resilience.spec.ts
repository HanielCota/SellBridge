import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { member, orders, storeConnections, user, webhookEvents } from "@sellbridge/database/schema";
import { encodeMockOrderResource } from "@sellbridge/marketplaces/testing";
import { and, eq } from "drizzle-orm";
import { DEMO_USER } from "./helpers";
import { requireEnvironmentVariable } from "./environment";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const MOCK_SECRET = requireEnvironmentVariable("E2E_MARKETPLACE_SECRET");
let storeId = "";
let shopId = "";

test.beforeAll(async () => {
  const [store] = await database
    .select({ id: storeConnections.id, shopId: storeConnections.externalShopId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(storeConnections, eq(storeConnections.tenantId, member.organizationId))
    .where(and(eq(user.email, DEMO_USER.email), eq(storeConnections.marketplace, "mercado_livre")))
    .limit(1);
  if (!store) {
    throw new Error("Conta demo sem loja simulada no banco de teste");
  }
  storeId = store.id;
  shopId = store.shopId;
});

test.afterAll(async () => {
  await database
    .update(storeConnections)
    .set({ status: "connected" })
    .where(eq(storeConnections.id, storeId));
  await database.$client.end();
});

async function setStoreStatus(status: "connected" | "expired") {
  await database.update(storeConnections).set({ status }).where(eq(storeConnections.id, storeId));
}

test("a sale that arrives while the store has expired comes in after reconnecting", async ({
  request,
}) => {
  const externalOrderId = `SIM-EXP-${randomUUID().slice(0, 8)}`;
  const notificationId = randomUUID();
  const body = JSON.stringify({
    id: notificationId,
    topic: "orders",
    shopId,
    resource: encodeMockOrderResource({
      externalOrderId,
      status: "paid",
      totalCents: 4990,
      marketplaceFeeCents: 600,
      buyerName: "Comprador",
      orderedAt: new Date().toISOString(),
      items: [{ externalListingId: "NAO-NOSSO", title: "Item", quantity: 1, unitPriceCents: 4990 }],
    }),
  });
  const headers = {
    "content-type": "application/json",
    "x-mock-signature": createHmac("sha256", MOCK_SECRET).update(body).digest("hex"),
  };
  const eventOf = async () =>
    database.query.webhookEvents.findFirst({
      where: eq(webhookEvents.externalEventId, notificationId),
    });

  await setStoreStatus("expired");
  expect(
    (await request.post("/api/webhooks/mercado_livre", { data: body, headers })).status(),
  ).toBe(200);
  // The worker holds the sale with the reason instead of dropping it.
  await expect(async () => {
    const event = await eventOf();
    expect(event?.error).toContain("reconectada");
    expect(event?.processedAt).toBeNull();
  }).toPass({ timeout: 30_000 });

  await setStoreStatus("connected");
  // Marketplaces resend unanswered notifications; a pending duplicate is queued again.
  expect(
    (await request.post("/api/webhooks/mercado_livre", { data: body, headers })).status(),
  ).toBe(200);
  await expect(async () => {
    const order = await database.query.orders.findFirst({
      where: eq(orders.externalOrderId, externalOrderId),
    });
    expect(order?.status).toBe("paid");
  }).toPass({ timeout: 30_000 });
});
