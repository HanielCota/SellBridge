import { describe, expect, it } from "vitest";
import { ratesNote } from "./mercado-livre-rates-note";

const now = new Date("2026-11-16T15:00:00Z");
const threeHoursAgo = "2026-11-16T12:00:00.000Z";

describe("ratesNote", () => {
  it("says the numbers are an estimate when nothing came from the store", () => {
    expect(ratesNote(null, now)).toMatch(/^Estimativa:/);
    expect(ratesNote({ liveCommission: false, liveShipping: false, readAt: null }, now)).toMatch(
      /^Estimativa:/,
    );
  });

  it("says when the store's commission and shipping were read", () => {
    const note = ratesNote(
      { liveCommission: true, liveShipping: true, readAt: threeHoursAgo },
      now,
    );

    expect(note).toBe("Comissão e frete da sua loja no Mercado Livre, consultados há 3 horas.");
  });

  it("says the shipping is an estimate without blaming only the supplier", () => {
    const note = ratesNote(
      { liveCommission: true, liveShipping: false, readAt: threeHoursAgo },
      now,
    );

    expect(note).toContain("Comissão da sua loja no Mercado Livre, consultada há 3 horas.");
    expect(note).toContain("faltam as medidas da embalagem ou o Mercado Livre não respondeu");
  });

  it("says the commission is an estimate without blaming only the product", () => {
    const note = ratesNote(
      { liveCommission: false, liveShipping: true, readAt: threeHoursAgo },
      now,
    );

    expect(note).toContain("Frete da sua loja no Mercado Livre, consultado há 3 horas.");
    expect(note).toContain("falta a categoria do produto no Mercado Livre ou ele não respondeu");
  });
});
