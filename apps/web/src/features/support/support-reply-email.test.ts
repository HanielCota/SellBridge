import { describe, expect, it } from "vitest";
import { supportReplyEmail } from "./support-reply-email";

describe("supportReplyEmail", () => {
  it("greets by first name and links to the ticket without copying the reply", () => {
    const email = supportReplyEmail(
      { name: "Ana Souza", email: "ana@sellbridge.test", subject: "Pedido atrasado" },
      "8d0c0a52-3b4f-4bb0-9a49-2f1f5d1f7c11",
      "https://app.sellbridge.test",
    );
    expect(email.to).toBe("ana@sellbridge.test");
    expect(email.subject).toBe("Nova resposta no seu chamado: Pedido atrasado");
    expect(email.text).toContain("Olá, Ana!");
    expect(email.text).toContain(
      "https://app.sellbridge.test/suporte/8d0c0a52-3b4f-4bb0-9a49-2f1f5d1f7c11",
    );
  });
});
