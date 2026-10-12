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

  it("falls back for actions it does not know", () => {
    expect(describeAdminEvent("something_new", null)).toBe("Ação do administrador");
  });
});
