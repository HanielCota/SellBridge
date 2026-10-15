import { describe, expect, it } from "vitest";
import { describeAdminEvent } from "./admin-actions";

describe("describeAdminEvent", () => {
  it("words each admin action for the timeline", () => {
    expect(describeAdminEvent("impersonated", null)).toBe("Entrou como o cliente");
    expect(describeAdminEvent("ban_changed", { banned: false })).toBe("Desbloqueou a conta");
    expect(describeAdminEvent("issue_assigned", { issue: "store" })).toBe(
      "Assumiu: lojas desconectadas",
    );
    expect(describeAdminEvent("issue_snoozed", { issue: "ticket", days: 1 })).toBe(
      "Adiou por 1 dia: chamados aguardando",
    );
  });

  it("tells the visit as the customer apart, with what the admin did there", () => {
    expect(describeAdminEvent("impersonation_ended", null)).toBe("Saiu da conta do cliente");
    expect(describeAdminEvent("email_changed", null)).toBe("Trocou o e-mail (aguarda confirmação)");
    expect(describeAdminEvent("acted_as_customer", { action: "forwardOrderFn" })).toBe(
      "Como o cliente: encaminhou um pedido",
    );
    expect(describeAdminEvent("acted_as_customer", { action: "someNewFn" })).toBe(
      "Como o cliente: fez uma alteração",
    );
  });

  it("falls back for actions it does not know", () => {
    expect(describeAdminEvent("something_new", null)).toBe("Ação do administrador");
  });
});
