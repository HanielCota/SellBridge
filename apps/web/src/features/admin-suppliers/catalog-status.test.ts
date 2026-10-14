import { describe, expect, it } from "vitest";
import { catalogStatusMessage, pausedListingsLabel } from "./catalog-status";

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
