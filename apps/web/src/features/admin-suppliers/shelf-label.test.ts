import { describe, expect, it } from "vitest";
import { shelfLabel } from "./shelf-label";

describe("shelfLabel", () => {
  it("shows only the shelf count when nothing is held", () => {
    expect(shelfLabel(22, 0)).toBe("22");
  });

  it("adds the units held by paid orders", () => {
    expect(shelfLabel(22, 1)).toBe("22 · 1 reservado");
    expect(shelfLabel(22, 3)).toBe("22 · 3 reservados");
  });

  it("says how many units are missing when holds exceed the shelf", () => {
    expect(shelfLabel(2, 5)).toBe("2 · 5 reservados · faltam 3");
  });
});
