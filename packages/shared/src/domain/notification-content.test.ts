import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_MAX_ATTEMPTS,
  nextNotificationAttemptAt,
  notificationContentSchema,
} from "./notification-content.ts";

const content = {
  subject: "Venda paga",
  preview: "Pedido 123",
  heading: "Você vendeu",
  paragraphs: ["Pedido 123 pago."],
  actionLabel: "Ver pedido",
  actionPath: "/pedidos/123",
  footnote: "Você recebe este e-mail porque ativou avisos de venda.",
};

describe("notificationContentSchema", () => {
  it("accepts a path inside the app", () => {
    expect(notificationContentSchema.safeParse(content).success).toBe(true);
  });

  it.each(["https://evil.test/x", "//evil.test/x", "pedidos/1", "/\\evil.test", "/a b"])(
    "rejects %s as the action path",
    (actionPath) => {
      expect(notificationContentSchema.safeParse({ ...content, actionPath }).success).toBe(false);
    },
  );
});

describe("nextNotificationAttemptAt", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("waits a minute after the first failure", () => {
    expect(nextNotificationAttemptAt(1, now)?.toISOString()).toBe("2026-01-01T12:01:00.000Z");
  });

  it("gives up when attempts run out", () => {
    expect(nextNotificationAttemptAt(NOTIFICATION_MAX_ATTEMPTS, now)).toBeNull();
    expect(nextNotificationAttemptAt(NOTIFICATION_MAX_ATTEMPTS - 1, now)).not.toBeNull();
  });
});
