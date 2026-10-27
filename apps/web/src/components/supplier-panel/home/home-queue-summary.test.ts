import { describe, expect, it } from "vitest";
import { catalogNote, lateCount, lateNote } from "./home-queue-summary";

const now = new Date("2026-10-27T15:00:00.000Z");
const HOUR = 3_600_000;

function rowDue(offsetHours: number) {
  return {
    deadline: { kind: "accept" as const, at: new Date(now.getTime() + offsetHours * HOUR) },
  };
}

describe("lateCount", () => {
  it("counts only the rows past their deadline", () => {
    expect(lateCount([rowDue(-3), rowDue(-0.1), rowDue(4), { deadline: null }], now)).toBe(2);
  });
});

describe("lateNote", () => {
  it("says nothing when no row is late", () => {
    expect(lateNote({ late: 0, loaded: 5, total: 5 })).toBeNull();
  });

  it("counts the late rows in the singular and plural", () => {
    expect(lateNote({ late: 1, loaded: 5, total: 5 })).toBe("1 atrasado");
    expect(lateNote({ late: 3, loaded: 5, total: 5 })).toBe("3 atrasados");
  });

  it("says the count is a floor when every loaded row is late and more wait behind", () => {
    expect(lateNote({ late: 5, loaded: 5, total: 9 })).toBe("5 ou mais atrasados");
  });
});

describe("catalogNote", () => {
  it("names rejected and sold-out products apart", () => {
    expect(catalogNote([{ kind: "rejected" }])).toBe("1 reprovado");
    expect(catalogNote([{ kind: "out_of_stock" }, { kind: "out_of_stock" }])).toBe("2 sem estoque");
    expect(catalogNote([{ kind: "rejected" }, { kind: "out_of_stock" }])).toBe(
      "1 reprovado, 1 sem estoque",
    );
    expect(catalogNote([])).toBe("Nada para ajustar");
  });
});
