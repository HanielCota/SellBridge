import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidBlingSignature, parseBlingNotice } from "./webhooks.ts";

const SECRET = "client-secret";

function signed(rawBody: Uint8Array, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const stockNotice = {
  eventId: "01945027-150b-7c16-ab12-a4a7aa8e8a47",
  date: "2026-11-19T12:00:00Z",
  version: "v1",
  event: "stock.updated",
  companyId: "d4475854366a36c86a37e792f9634a51",
  data: {
    produto: { id: 12345678 },
    deposito: { id: 1, saldoFisico: 5, saldoVirtual: 5 },
    operacao: "S",
    quantidade: 1,
    saldoFisicoTotal: 5,
    saldoVirtualTotal: 5,
  },
};

describe("isValidBlingSignature", () => {
  it("accepts the HMAC-SHA256 of the raw body keyed with the client secret", () => {
    const rawBody = bytes(JSON.stringify(stockNotice));

    expect(
      isValidBlingSignature({ rawBody, signature: signed(rawBody), clientSecret: SECRET }),
    ).toBe(true);
  });

  it("refuses a body changed after signing", () => {
    const rawBody = bytes(JSON.stringify(stockNotice));

    expect(
      isValidBlingSignature({
        rawBody: bytes(JSON.stringify(stockNotice).replace("12345678", "87654321")),
        signature: signed(rawBody),
        clientSecret: SECRET,
      }),
    ).toBe(false);
  });

  it("refuses a signature made with another secret", () => {
    const rawBody = bytes(JSON.stringify(stockNotice));

    expect(
      isValidBlingSignature({ rawBody, signature: signed(rawBody, "other"), clientSecret: SECRET }),
    ).toBe(false);
  });

  it("checks the bytes as received, so a body starting with a BOM keeps its signature", () => {
    const rawBody = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes(JSON.stringify(stockNotice))]);

    expect(
      isValidBlingSignature({ rawBody, signature: signed(rawBody), clientSecret: SECRET }),
    ).toBe(true);
  });

  it("refuses everything while the client secret is empty, even a body signed with it", () => {
    const rawBody = bytes(JSON.stringify(stockNotice));

    expect(
      isValidBlingSignature({ rawBody, signature: signed(rawBody, ""), clientSecret: "" }),
    ).toBe(false);
  });

  it("refuses a missing, unprefixed or truncated signature", () => {
    const rawBody = bytes(JSON.stringify(stockNotice));
    const valid = signed(rawBody);

    expect(isValidBlingSignature({ rawBody, signature: null, clientSecret: SECRET })).toBe(false);
    expect(
      isValidBlingSignature({ rawBody, signature: valid.slice(7), clientSecret: SECRET }),
    ).toBe(false);
    expect(
      isValidBlingSignature({ rawBody, signature: valid.slice(0, -2), clientSecret: SECRET }),
    ).toBe(false);
  });
});

describe("parseBlingNotice", () => {
  it("reads which company's product had its stock changed", () => {
    expect(parseBlingNotice(stockNotice)).toEqual({
      kind: "stock",
      eventId: stockNotice.eventId,
      companyId: stockNotice.companyId,
      erpProductId: 12345678,
    });
  });

  it("reads reservation (virtual stock) and deletion notices as stock changes", () => {
    const virtual = { ...stockNotice, event: "virtual_stock.updated" };
    const deleted = { ...stockNotice, event: "stock.deleted" };

    expect(parseBlingNotice(virtual)?.kind).toBe("stock");
    expect(parseBlingNotice(deleted)?.kind).toBe("stock");
  });

  it("names other events without reading them", () => {
    expect(parseBlingNotice({ ...stockNotice, event: "order.created" })).toEqual({
      kind: "other",
      event: "order.created",
    });
  });

  it("returns null for a notice without a product or company", () => {
    expect(parseBlingNotice({ ...stockNotice, data: {} })).toBeNull();
    expect(parseBlingNotice({ ...stockNotice, companyId: "" })).toBeNull();
    expect(parseBlingNotice("not an object")).toBeNull();
  });
});
