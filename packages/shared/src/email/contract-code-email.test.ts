import { describe, expect, it } from "vitest";
import { contractCodeEmail } from "./contract-code-email.ts";

describe("contractCodeEmail", () => {
  it("puts the code in the body with how long it lasts, and never in the subject", () => {
    const email = contractCodeEmail(
      { code: "042917", contractTitle: "Contrato de vendedor" },
      "https://app.sellbridge.test",
    );

    expect(email.subject).toBe("Seu código para assinar o contrato do SellBridge");
    expect(email.subject).not.toContain("042917");
    expect(email.text).toContain("042917");
    expect(email.text).toContain("contrato de vendedor");
    expect(email.text).toContain("10 minutos");
    expect(email.html).toContain("042917");
  });
});
