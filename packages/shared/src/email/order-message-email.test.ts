import { describe, expect, it } from "vitest";
import { supplierOrderMessageEmail } from "./order-message-email.ts";

const APP_URL = "https://app.sellbridge.test";
const FORWARDED_AT = new Date("2026-10-20T15:00:00Z");

describe("supplierOrderMessageEmail", () => {
  it("tells a supplier without an account which e-mail holds its link, with no new link", () => {
    const email = supplierOrderMessageEmail(
      { externalOrderId: "2000012345", forwardedAt: FORWARDED_AT },
      APP_URL,
    );
    expect(email.subject).toBe("Nova mensagem no pedido #2000012345");
    expect(email.text).toContain("recebeu por e-mail em 20/10/2026");
    expect(email.html).not.toContain("/fornecedor/pedido/");
    expect(email.html).not.toContain("<a href");
  });

  it("never carries the message itself", () => {
    const email = supplierOrderMessageEmail(
      { externalOrderId: "2000012345", forwardedAt: FORWARDED_AT },
      APP_URL,
    );
    expect(email.text).toContain("o texto da mensagem não vai por e-mail");
  });
});
