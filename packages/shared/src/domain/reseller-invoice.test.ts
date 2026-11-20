import { describe, expect, it } from "vitest";
import { nextResellerInvoiceCheckAt, onBehalfLabelRefusal } from "./reseller-invoice.ts";

const NOW = new Date("2026-11-19T12:00:00Z");

function minutesAfterNow(date: Date): number {
  return (date.getTime() - NOW.getTime()) / 60_000;
}

describe("nextResellerInvoiceCheckAt", () => {
  it("reads again in 5 minutes after the first read, doubling after each one", () => {
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(1, NOW))).toBe(5);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(2, NOW))).toBe(10);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(4, NOW))).toBe(40);
  });

  it("waits at most an hour between reads", () => {
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(5, NOW))).toBe(60);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(500, NOW))).toBe(60);
  });

  it("throws for a count that is not a positive integer", () => {
    for (const checks of [0, -1, 1.5, Number.NaN]) {
      expect(() => nextResellerInvoiceCheckAt(checks, NOW)).toThrow(RangeError);
    }
  });
});

describe("onBehalfLabelRefusal", () => {
  const ready = { resellerNoteSource: "marketplace", remessaAuthorized: true } as const;

  it("lets the label out once every note is in place", () => {
    expect(onBehalfLabelRefusal([ready], "mercado_livre")).toBeNull();
  });

  it("lets a direct-note order out: it has no venda à ordem parcel", () => {
    expect(onBehalfLabelRefusal([], "mercado_livre")).toBeNull();
  });

  it("waits for the reseller's note", () => {
    const refusal = onBehalfLabelRefusal(
      [{ resellerNoteSource: null, remessaAuthorized: false }],
      "tiktok_shop",
    );

    expect(refusal).toMatch(/espera a nota de venda do revendedor/);
  });

  it("asks for the XML when Mercado Livre only got a typed key", () => {
    const refusal = onBehalfLabelRefusal(
      [{ resellerNoteSource: "typed", remessaAuthorized: true }],
      "mercado_livre",
    );

    expect(refusal).toMatch(/envia o XML/);
  });

  it("takes a typed key on a marketplace that does not ask for the note", () => {
    expect(
      onBehalfLabelRefusal(
        [{ resellerNoteSource: "typed", remessaAuthorized: true }],
        "tiktok_shop",
      ),
    ).toBeNull();
  });

  it("waits for the remessa that goes in the box", () => {
    const refusal = onBehalfLabelRefusal(
      [{ resellerNoteSource: "uploaded", remessaAuthorized: false }],
      "mercado_livre",
    );

    expect(refusal).toMatch(/nota de remessa do fornecedor/);
  });
});
