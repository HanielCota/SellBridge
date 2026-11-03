import { describe, expect, it } from "vitest";
import { saleSwitchMessage } from "./sale-switch-message";

describe("saleSwitchMessage", () => {
  it("says the product is back on sale", () => {
    expect(saleSwitchMessage({ active: true, pausedTargets: 0 })).toBe("Produto reativado");
  });

  it("says only that it is off sale when no listing was live", () => {
    expect(saleSwitchMessage({ active: false, pausedTargets: 0 })).toBe("Produto desativado");
  });

  it("counts one paused listing in the singular", () => {
    expect(saleSwitchMessage({ active: false, pausedTargets: 1 })).toBe(
      "Produto desativado · 1 anúncio pausado",
    );
  });

  it("counts several paused listings in the plural", () => {
    expect(saleSwitchMessage({ active: false, pausedTargets: 3 })).toBe(
      "Produto desativado · 3 anúncios pausados",
    );
  });
});
