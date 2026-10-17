import { schema } from "@sellbridge/database";
import { enqueueNotificationDeliveries } from "@sellbridge/database/repositories";
import type { OutgoingEmail } from "@sellbridge/shared/mailer";
import { NOTIFICATION_MAX_ATTEMPTS } from "@sellbridge/shared/notification-content";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestTenants, createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { createNotificationDeliveryProcessor } from "./notification-delivery.ts";

const { database } = createWorkerTestEnvironment();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantId = "";
const recipientId = `worker-notice-${crypto.randomUUID()}`;
const recipientEmail = `${recipientId}@sellbridge.test`;

const content = {
  subject: "Venda paga: Fone",
  preview: "R$ 25,00",
  heading: "Você vendeu um Fone",
  paragraphs: ["Organize o pagamento ao fornecedor."],
  actionLabel: "Ver pedido",
  actionPath: "/pedidos/abc",
  footnote: "Aviso de venda.",
};

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.first;
  await database
    .insert(schema.user)
    .values({ id: recipientId, name: "Revendedor", email: recipientEmail });
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(schema.user).where(eq(schema.user.id, recipientId));
  await database.$client.end();
});

async function queue(dedupeKey: string, channel: "email" | "push") {
  await enqueueNotificationDeliveries(database, {
    tenantId,
    event: "sale_paid",
    dedupeKey,
    content,
    recipients: [{ userId: recipientId, channels: [channel] }],
  });
}

async function rowOf(dedupeKey: string) {
  const [row] = await database
    .select()
    .from(schema.notificationDeliveries)
    .where(eq(schema.notificationDeliveries.dedupeKey, dedupeKey));
  return row;
}

describe("notification-delivery processor", () => {
  it("sends the e-mail in the branded layout with a link inside the app", async () => {
    const sent: OutgoingEmail[] = [];
    await queue("processor:sent", "email");
    const process = createNotificationDeliveryProcessor({
      database,
      appUrl: "https://app.sellbridge.test",
      sendEmail: async (email) => {
        sent.push(email);
      },
      tenantId,
    });
    expect(await process()).toMatchObject({ sent: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(recipientEmail);
    expect(sent[0]?.subject).toBe("Venda paga: Fone");
    expect(sent[0]?.html).toContain("https://app.sellbridge.test/pedidos/abc");
    expect((await rowOf("processor:sent"))?.status).toBe("sent");
  });

  it("retries a failed e-mail later and gives up when attempts run out", async () => {
    await queue("processor:retry", "email");
    let now = new Date();
    const process = createNotificationDeliveryProcessor({
      database,
      appUrl: "https://app.sellbridge.test",
      sendEmail: async () => {
        throw new Error("Resend fora do ar");
      },
      tenantId,
      now: () => now,
    });
    await process();
    const afterFirst = await rowOf("processor:retry");
    expect(afterFirst).toMatchObject({ status: "pending", attempts: 1 });
    expect(afterFirst?.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    for (let attempt = 2; attempt <= NOTIFICATION_MAX_ATTEMPTS; attempt += 1) {
      now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await process();
    }
    expect(await rowOf("processor:retry")).toMatchObject({
      status: "failed",
      attempts: NOTIFICATION_MAX_ATTEMPTS,
    });
  });

  it("skips push, which is not configured yet, without retrying", async () => {
    await queue("processor:push", "push");
    const process = createNotificationDeliveryProcessor({
      database,
      appUrl: "https://app.sellbridge.test",
      sendEmail: async () => undefined,
      tenantId,
    });
    expect(await process()).toMatchObject({ skipped: 1 });
    expect((await rowOf("processor:push"))?.status).toBe("skipped");
  });
});
