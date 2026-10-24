import { describe, expect, it } from "vitest";
import { supplierFlagEmail } from "./supplier-flag-email.ts";

const APP_URL = "https://app.sellbridge.test";
const PANEL_URL = `${APP_URL}/fornecedor/painel`;

describe("supplierFlagEmail", () => {
  it("names the reason and the count of a new flag, without the team's note", () => {
    const email = supplierFlagEmail(
      { reason: "order_error", activeCount: 1, deactivated: false, panelUrl: PANEL_URL },
      APP_URL,
    );
    expect(email.subject).toBe("Nova flag na sua conta: Erro em pedido");
    expect(email.text).toContain("Flags ativas: 1 de 3 em 90 dias.");
    expect(email.text).toContain("Na 3ª flag a conta é desligada.");
    expect(email.text).toContain(PANEL_URL);
  });

  it("warns when one more flag switches the account off", () => {
    const email = supplierFlagEmail(
      { reason: "slow_support", activeCount: 2, deactivated: false, panelUrl: PANEL_URL },
      APP_URL,
    );
    expect(email.text).toContain("Falta 1 flag para a conta ser desligada.");
  });

  it("says the account is off, and that orders already received still go out", () => {
    const email = supplierFlagEmail(
      { reason: "stale_catalog", activeCount: 3, deactivated: true, panelUrl: PANEL_URL },
      APP_URL,
    );
    expect(email.subject).toBe("Sua conta de fornecedor foi desligada");
    expect(email.text).toContain("Seus produtos saíram do catálogo");
    expect(email.text).toContain("entregue todos normalmente");
  });
});
