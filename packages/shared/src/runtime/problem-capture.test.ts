import { describe, expect, it } from "vitest";
import type { ProblemLogEntry } from "./logger.ts";
import { captureProblem, problemAreaOf, problemFingerprint, scrubText } from "./problem-capture.ts";

const OCCURRED_AT = new Date("2026-11-13T14:02:00Z");

function entry(
  level: ProblemLogEntry["level"],
  event: string,
  fields: Record<string, unknown>,
): ProblemLogEntry {
  return { level, event, line: JSON.stringify({ level, event, time: "t", ...fields }) };
}

describe("captureProblem", () => {
  it("keeps the ids of the tenant, store and listing and the error's message", () => {
    const captured = captureProblem(
      entry("error", "listing.persist_after_publish_failed", {
        tenantId: "org-1",
        storeConnectionId: "store-1",
        listingTargetId: "target-1",
        error: { name: "Error", message: "connection reset" },
      }),
      "worker",
      OCCURRED_AT,
    );

    expect(captured).toMatchObject({
      service: "worker",
      area: "publishing",
      message: "connection reset",
      tenantId: "org-1",
      storeConnectionId: "store-1",
      listingTargetId: "target-1",
      occurredAt: OCCURRED_AT,
    });
    expect(captured?.context).not.toHaveProperty("level");
  });

  it("records a publication that failed for good, but not one that will be retried", () => {
    const fields = { tenantId: "org-1", reason: "O Mercado Livre recusou o título" };

    const final = captureProblem(
      entry("warn", "listing.publish_failed", { ...fields, isFinal: true }),
      "worker",
      OCCURRED_AT,
    );
    const retried = captureProblem(
      entry("warn", "listing.publish_failed", { ...fields, isFinal: false }),
      "worker",
      OCCURRED_AT,
    );

    expect(final?.message).toBe("O Mercado Livre recusou o título");
    expect(retried).toBeNull();
  });

  it("ignores other warnings", () => {
    const captured = captureProblem(
      entry("warn", "web.server_function_refused", {}),
      "web",
      OCCURRED_AT,
    );

    expect(captured).toBeNull();
  });

  it("ignores a line that is not JSON", () => {
    const captured = captureProblem(
      { level: "error", event: "x", line: "not json" },
      "web",
      OCCURRED_AT,
    );

    expect(captured).toBeNull();
  });

  it("keeps no token, e-mail or CPF, by field name or inside a message", () => {
    const captured = captureProblem(
      entry("error", "store.order_catch_up_not_queued", {
        accessToken: "APP_USR-1234567890123456-111213-abcdefabcdefabcdefabcdef-99887766",
        buyer: { email: "maria@example.com", cpf: "123.456.789-09" },
        note: "Bearer abc.def.ghi para joao@example.com.br, CPF 98765432100",
        error: {
          message: "token APP_USR-1234567890123456-111213-abcdefabcdefabcdefabcdef-1 refused",
        },
        url: "https://api.example.com/orders?access_token=secret-value",
      }),
      "web",
      OCCURRED_AT,
    );

    const stored = JSON.stringify(captured);
    expect(stored).not.toContain("APP_USR");
    expect(stored).not.toContain("maria@example.com");
    expect(stored).not.toContain("joao@example.com.br");
    expect(stored).not.toContain("123.456.789-09");
    expect(stored).not.toContain("98765432100");
    expect(stored).not.toContain("abc.def.ghi");
    expect(stored).not.toContain("secret-value");
    expect(stored).toContain("https://api.example.com/orders?[redacted]");
  });

  it("caps long strings", () => {
    const captured = captureProblem(
      entry("error", "x.failed", { error: { message: "falhou ".repeat(1000) } }),
      "web",
      OCCURRED_AT,
    );

    expect(captured?.message.length).toBeLessThanOrEqual(300);
  });
});

describe("scrubText", () => {
  it("keeps uuids and package versions in a stack", () => {
    const text = "at 3f2a1b4c-1d2e-4f50-8a9b-0c1d2e3f4a5b (drizzle-orm@0.45.4/index.js:10)";

    expect(scrubText(text)).toBe(text);
  });
});

describe("problemFingerprint", () => {
  it("groups the same error about different ids and numbers", () => {
    const first = problemFingerprint(
      "worker",
      "e",
      "Order 123 failed for 3f2a1b4c-1d2e-4f50-8a9b-0c1d2e3f4a5b",
    );
    const second = problemFingerprint(
      "worker",
      "e",
      "order 98 failed for 9e8d7c6b-1d2e-4f50-8a9b-0c1d2e3f4a5b",
    );

    expect(first).toBe(second);
  });

  it("tells apart services, events and messages", () => {
    const base = problemFingerprint("worker", "e", "timeout");

    expect(problemFingerprint("web", "e", "timeout")).not.toBe(base);
    expect(problemFingerprint("worker", "f", "timeout")).not.toBe(base);
    expect(problemFingerprint("worker", "e", "refused")).not.toBe(base);
  });
});

describe("problemAreaOf", () => {
  it.each([
    ["listing.sync_failed", null, "sync"],
    ["listing.publish_failed", null, "publishing"],
    ["erp.token_refresh_job_failed", null, "invoices"],
    ["billing.webhook_failed", null, "payments"],
    ["mercado_pago.webhook_failed", null, "payments"],
    ["email.send_failed", null, "email"],
    ["auth.admin_verification_email_failed", null, "email"],
    ["store.order_catch_up_not_queued", null, "orders"],
    ["supplier_panel.batch_label_failed", null, "orders"],
    ["worker.error", "publish-listing", "publishing"],
    ["worker.error", "webhook-events", "orders"],
    ["worker.error", null, "other"],
    ["web.server_function_error", null, "other"],
  ] as const)("puts %s (queue %s) under %s", (event, queue, area) => {
    expect(problemAreaOf(event, queue)).toBe(area);
  });
});
