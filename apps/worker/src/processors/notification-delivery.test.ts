import { schema } from "@sellbridge/database";
import { enqueueNotificationDeliveries } from "@sellbridge/database/repositories";
import { AppError } from "@sellbridge/shared/errors";
import type { OutgoingEmail } from "@sellbridge/shared/mailer";
import { NOTIFICATION_MAX_ATTEMPTS } from "@sellbridge/shared/notification-content";
import { problemsLoggedBy } from "@sellbridge/shared/problem-capture-testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestTenants, createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { createNotificationDeliveryProcessor } from "./notification-delivery.ts";

const { database } = createWorkerTestEnvironment();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantId = "";
const recipientId = `worker-notice-${crypto.randomUUID()}`;
const recipientEmail = `${recipientId}@sellbridge.test`;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

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

  it("sends the files the e-mail carries as attachments", async () => {
    const sent: OutgoingEmail[] = [];
    await queue("processor:attachments", "email");
    const attachment = { filename: "nfe-1234.xml", content: new TextEncoder().encode("<nfe/>") };
    const process = createNotificationDeliveryProcessor({
      database,
      appUrl: "https://app.sellbridge.test",
      sendEmail: async (email) => {
        sent.push(email);
      },
      emailAttachments: async () => [attachment],
      tenantId,
    });

    await process();

    expect(sent[0]?.attachments).toEqual([attachment]);
  });

  it("holds an e-mail until tomorrow, without spending an attempt, when the daily allowance is used up", async () => {
    await queue("processor:daily-cap", "email");
    const resetsAt = new Date(Date.now() + ONE_DAY_IN_MS);
    const process = createNotificationDeliveryProcessor({
      database,
      appUrl: "https://app.sellbridge.test",
      sendEmail: async () => {
        throw new AppError("RATE_LIMITED", "O limite de e-mails de hoje foi atingido.", {
          details: { retryable: true, retryAt: resetsAt },
        });
      },
      tenantId,
    });

    const summary = await process();

    expect(summary).toMatchObject({ postponed: 1, failed: 0, sent: 0 });
    const row = await rowOf("processor:daily-cap");
    expect(row).toMatchObject({ status: "pending", attempts: 0 });
    expect(row?.nextAttemptAt).toEqual(resetsAt);
    // The held row would fall due inside later tests, which move their clock days ahead.
    await database
      .delete(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.dedupeKey, "processor:daily-cap"));
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
    const problems = await problemsLoggedBy(async () => {
      for (let attempt = 2; attempt <= NOTIFICATION_MAX_ATTEMPTS; attempt += 1) {
        now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        await process();
      }
    });
    expect(await rowOf("processor:retry")).toMatchObject({
      status: "failed",
      attempts: NOTIFICATION_MAX_ATTEMPTS,
    });
    const gaveUp = problems.filter((problem) => problem.event === "notification.delivery_gave_up");
    expect(gaveUp).toHaveLength(1);
    expect(gaveUp[0]).toMatchObject({
      area: "email",
      message: expect.stringContaining("não foi entregue"),
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
