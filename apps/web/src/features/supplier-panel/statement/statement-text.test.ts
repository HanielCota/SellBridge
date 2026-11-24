import { describe, expect, it } from "vitest";
import { decodeStatementCursor, encodeStatementCursor } from "./statement-cursor";
import { statementItemsLabel, statementSituationPill } from "./statement-text";

describe("statementSituationPill", () => {
  it("says the day the money is released, in Brazil time", () => {
    // 01:00 UTC on 30/11 is still 29/11 in São Paulo.
    const pill = statementSituationPill({
      kind: "releases_on",
      on: new Date("2026-11-30T01:00:00Z"),
    });

    expect(pill).toEqual({ tone: "neutral", text: "Libera em 29/11/2026" });
  });

  it("marks released money as success with its day", () => {
    const pill = statementSituationPill({ kind: "released", on: new Date("2026-12-02T15:00:00Z") });

    expect(pill).toEqual({ tone: "success", text: "Liberado em 02/12/2026" });
  });

  it("uses the same words as the parcel window for a refund on its way", () => {
    expect(statementSituationPill({ kind: "returning" }).text).toBe("Devolução em andamento");
  });
});

describe("statementItemsLabel", () => {
  it("names the first product with its quantity and counts the others", () => {
    const label = statementItemsLabel([
      { title: "Camiseta", quantity: 2 },
      { title: "Boné", quantity: 1 },
      { title: "Meia", quantity: 3 },
    ]);

    expect(label).toBe("Camiseta (2) e mais 2 produtos");
  });

  it("shows a single product without a quantity of one", () => {
    expect(statementItemsLabel([{ title: "Boné", quantity: 1 }])).toBe("Boné");
  });

  it("still says something when the parcel has no items", () => {
    expect(statementItemsLabel([])).toBe("Produtos do pedido");
  });
});

describe("statement cursor", () => {
  it("reads back the line it was written from", () => {
    const line = { paidAt: new Date("2026-11-20T12:00:00Z"), id: crypto.randomUUID() };

    expect(decodeStatementCursor(encodeStatementCursor(line))).toEqual(line);
  });

  it("refuses a cursor it did not write", () => {
    expect(decodeStatementCursor("2026-11-20_not-a-uuid")).toBeNull();
    expect(decodeStatementCursor("garbage")).toBeNull();
  });
});
