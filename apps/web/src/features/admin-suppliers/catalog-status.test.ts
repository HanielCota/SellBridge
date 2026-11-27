import { describe, expect, it } from "vitest";
import { catalogStatusMessage, pausedListingsLabel, productSaleStatus } from "./catalog-status";

describe("catalogStatusMessage", () => {
  it("says how many listings the deactivation paused", () => {
    expect(catalogStatusMessage("Produto", { active: false, pausedTargets: 1 })).toBe(
      "Produto desativado · 1 anúncio pausado",
    );
    expect(catalogStatusMessage("Fornecedor", { active: false, pausedTargets: 3 })).toBe(
      "Fornecedor desativado · 3 anúncios pausados",
    );
  });

  it("stays short when nothing was paused", () => {
    expect(catalogStatusMessage("Produto", { active: true, pausedTargets: 0 })).toBe(
      "Produto ativado",
    );
    expect(pausedListingsLabel(0)).toBeNull();
  });
});

describe("productSaleStatus", () => {
  const teamDraft = {
    active: true,
    reviewStatus: "draft" as const,
    fiscalRequired: true,
    weightRequired: true,
  };

  it("says which data keeps a team draft off sale", () => {
    const status = productSaleStatus({ ...teamDraft, missingForSale: ["NCM", "peso"] });

    expect(status.label).toBe("Rascunho");
    expect(status.detail).toBe("Falta NCM e peso. Preencha em Editar para pôr à venda");
  });

  it("tells the team to save a complete draft to put it on sale", () => {
    const status = productSaleStatus({ ...teamDraft, missingForSale: [] });

    expect(status.detail).toBe("Os dados estão completos. Abra em Editar e salve para pôr à venda");
  });

  it("leaves a supplier's own panel draft to the supplier", () => {
    const status = productSaleStatus({
      ...teamDraft,
      fiscalRequired: false,
      weightRequired: false,
      missingForSale: [],
    });

    expect(status.detail).toBe("O fornecedor ainda não publicou no painel dele");
  });

  it("shows a switched-off product as off, whatever its review status", () => {
    const status = productSaleStatus({ ...teamDraft, active: false, missingForSale: ["peso"] });

    expect(status).toEqual({ tone: "muted", label: "Desativado", detail: null });
  });
});
