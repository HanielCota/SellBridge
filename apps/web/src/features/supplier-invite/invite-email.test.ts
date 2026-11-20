import { describe, expect, it } from "vitest";
import { supplierInviteEmail } from "./invite-email";

const INVITE_URL = "https://app.sellbridge.com.br/fornecedor/convite/abc.123.def";

describe("supplierInviteEmail", () => {
  it("names the e-mail to use and links to the invite", () => {
    const email = supplierInviteEmail(
      {
        supplierName: "Cerâmica Teste",
        contactEmail: "pedidos@ceramica.com.br",
        inviteUrl: INVITE_URL,
      },
      "https://app.sellbridge.com.br",
    );

    expect(email.subject).toBe("Ative o painel da Cerâmica Teste no SellBridge");
    expect(email.text).toContain("pedidos@ceramica.com.br");
    expect(email.text).toContain("O convite vale 14 dias");
    expect(email.html).toContain(`href="${INVITE_URL}"`);
  });

  it("escapes a supplier name typed by the team", () => {
    const email = supplierInviteEmail(
      {
        supplierName: "Loja <b>Teste</b>",
        contactEmail: "pedidos@loja.com.br",
        inviteUrl: INVITE_URL,
      },
      "https://app.sellbridge.com.br",
    );

    expect(email.html).not.toContain("<b>Teste</b>");
  });
});
