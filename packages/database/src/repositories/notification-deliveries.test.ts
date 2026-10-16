import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notificationDeliveries } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import {
  claimDueNotificationDeliveries,
  enqueueNotificationDeliveries,
  markNotificationAttemptFailed,
  markNotificationSent,
  markNotificationSkipped,
} from "./notification-deliveries.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let resellerA = "";
let resellerB = "";

const content = {
  subject: "Venda paga",
  preview: "Pedido 1",
  heading: "Você vendeu",
  paragraphs: ["Pedido 1 pago."],
  actionLabel: "Ver pedido",
  actionPath: "/pedidos/1",
  footnote: "Aviso de venda.",
};
const past = new Date("2026-01-01T12:00:00.000Z");
const lease = { limit: 50, leaseMilliseconds: 60_000 };

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 2);
  [resellerA = "", resellerB = ""] = users.ids;
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

async function deliveriesOf(recipientId: string) {
  return database
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.recipientId, recipientId));
}

describe("enqueueNotificationDeliveries", () => {
  it("queues one delivery per recipient and channel, once per fact", async () => {
    const notice = {
      tenantId: tenants.tenantA,
      event: "sale_paid",
      dedupeKey: "order:dedupe:paid",
      content,
      recipients: [{ userId: resellerA, channels: ["email", "push"] as const }],
    };
    expect(await enqueueNotificationDeliveries(database, notice)).toBe(2);
    expect(await enqueueNotificationDeliveries(database, notice)).toBe(0);
    const rows = await deliveriesOf(resellerA);
    expect(rows.filter((row) => row.dedupeKey === "order:dedupe:paid")).toHaveLength(2);
  });

  it("rejects content whose link leaves the app", async () => {
    await expect(
      enqueueNotificationDeliveries(database, {
        tenantId: tenants.tenantA,
        event: "sale_paid",
        dedupeKey: "order:evil:paid",
        content: { ...content, actionPath: "https://evil.test" },
        recipients: [{ userId: resellerA, channels: ["email"] }],
      }),
    ).rejects.toThrow(/caminho interno/);
  });
});

describe("claimDueNotificationDeliveries", () => {
  it("claims only the asked tenant's due deliveries, with the recipient's e-mail", async () => {
    await enqueueNotificationDeliveries(database, {
      tenantId: tenants.tenantB,
      event: "sale_paid",
      dedupeKey: "order:b:paid",
      content,
      recipients: [{ userId: resellerB, channels: ["email"] }],
    });
    const claimed = await claimDueNotificationDeliveries(database, {
      ...lease,
      now: new Date(),
      tenantId: tenants.tenantB,
    });
    expect(claimed.map((delivery) => delivery.recipientId)).toEqual([resellerB]);
    expect(claimed[0]?.recipientEmail).toBe(`test-${resellerB}@sellbridge.test`);
    expect(claimed[0]?.content.actionPath).toBe("/pedidos/1");
    const again = await claimDueNotificationDeliveries(database, {
      ...lease,
      now: new Date(),
      tenantId: tenants.tenantB,
    });
    expect(again).toEqual([]);
  });
});

async function queueOne(dedupeKey: string) {
  await enqueueNotificationDeliveries(database, {
    tenantId: tenants.tenantA,
    event: "sale_paid",
    dedupeKey,
    content,
    recipients: [{ userId: resellerA, channels: ["email"] }],
  });
  const [row] = await database
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, resellerA),
        eq(notificationDeliveries.dedupeKey, dedupeKey),
      ),
    );
  if (row === undefined) {
    throw new Error("entrega não criada");
  }
  return row.id;
}

async function rowOf(id: string) {
  const [row] = await database
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, id));
  return row;
}

describe("delivery outcomes", () => {
  it("marks a sent delivery and counts the attempt", async () => {
    const id = await queueOne("outcome:sent");
    await markNotificationSent(database, id, past);
    expect(await rowOf(id)).toMatchObject({ status: "sent", attempts: 1, sentAt: past });
  });

  it("keeps a failed delivery pending until attempts run out", async () => {
    const id = await queueOne("outcome:failed");
    const retryAt = new Date("2026-01-01T12:05:00.000Z");
    await markNotificationAttemptFailed(database, id, {
      error: "Resend 500",
      nextAttemptAt: retryAt,
    });
    expect(await rowOf(id)).toMatchObject({
      status: "pending",
      attempts: 1,
      nextAttemptAt: retryAt,
    });
    await markNotificationAttemptFailed(database, id, { error: "Resend 500", nextAttemptAt: null });
    expect(await rowOf(id)).toMatchObject({
      status: "failed",
      attempts: 2,
      lastError: "Resend 500",
    });
  });

  it("never touches a delivery that is no longer pending", async () => {
    const id = await queueOne("outcome:late");
    await markNotificationSent(database, id, past);
    await markNotificationAttemptFailed(database, id, { error: "atrasado", nextAttemptAt: null });
    expect(await rowOf(id)).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("marks a delivery the channel cannot make as skipped", async () => {
    const id = await queueOne("outcome:skipped");
    await markNotificationSkipped(database, id, "Push ainda não configurado");
    expect(await rowOf(id)).toMatchObject({
      status: "skipped",
      lastError: "Push ainda não configurado",
    });
  });
});
