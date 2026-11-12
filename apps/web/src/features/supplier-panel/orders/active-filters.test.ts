import { describe, expect, it } from "vitest";
import { activeOrderFilterCount, filterButtonLabel } from "./active-filters";

describe("activeOrderFilterCount", () => {
  it("counts nothing when the list shows every order", () => {
    expect(activeOrderFilterCount({ period: "all" })).toBe(0);
  });

  it("counts the period, the store, the channel and the label that narrow the list", () => {
    const count = activeOrderFilterCount({
      period: "7d",
      store: "6f1c2a4e-8a1b-4c3d-9e2f-1a2b3c4d5e6f",
      channel: "mercado_livre",
      label: "pending",
    });

    expect(count).toBe(4);
  });
});

describe("filterButtonLabel", () => {
  it("says only Filtrar when nothing is active", () => {
    expect(filterButtonLabel(0)).toBe("Filtrar");
  });

  it("says how many filters are active, in the singular and the plural", () => {
    expect(filterButtonLabel(1)).toBe("Filtrar · 1 ativo");
    expect(filterButtonLabel(3)).toBe("Filtrar · 3 ativos");
  });
});
