import { describe, expect, it } from "vitest";
import { contractCodeEmail } from "./contract-code-email.ts";

describe("contractCodeEmail", () => {
  it("puts the code in the subject and the body, with how long it lasts", () => {
    const email = contractCodeEmail(
      { code: "042917", contractTitle: "Contrato de vendedor" },
      "https://app.sellbridge.test",
    );

    expect(email.subject).toBe("Seu código para assinar: 042917");
    expect(email.text).toContain("042917");
    expect(email.text).toContain("contrato de vendedor");
    expect(email.text).toContain("10 minutos");
    expect(email.html).toContain("042917");
  });
});
