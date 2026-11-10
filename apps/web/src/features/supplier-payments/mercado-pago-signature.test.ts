import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { isValidMercadoPagoSignature, mercadoPagoSignatureFor } from "./mercado-pago-signature.ts";

const secret = "test-signature-secret";

describe("isValidMercadoPagoSignature", () => {
  test("accepts the signature Mercado Pago computes over id, request id and ts", () => {
    const v1 = createHmac("sha256", secret)
      .update("id:123456;request-id:req-1;ts:1704908010;")
      .digest("hex");

    const valid = isValidMercadoPagoSignature({
      secret,
      signatureHeader: `ts=1704908010,v1=${v1}`,
      requestIdHeader: "req-1",
      dataId: "123456",
    });

    expect(valid).toBe(true);
  });

  test("lowercases an alphanumeric data id before checking", () => {
    const header = mercadoPagoSignatureFor({ secret, dataId: "abc", requestId: "r", ts: "1" });

    const valid = isValidMercadoPagoSignature({
      secret,
      signatureHeader: header,
      requestIdHeader: "r",
      dataId: "ABC",
    });

    expect(valid).toBe(true);
  });

  test("leaves a missing request id out of the manifest", () => {
    const v1 = createHmac("sha256", secret).update("id:9;ts:5;").digest("hex");

    const valid = isValidMercadoPagoSignature({
      secret,
      signatureHeader: `ts=5, v1=${v1}`,
      requestIdHeader: null,
      dataId: "9",
    });

    expect(valid).toBe(true);
  });

  test("refuses a notice signed for another payment", () => {
    const header = mercadoPagoSignatureFor({ secret, dataId: "1", requestId: "r", ts: "1" });

    const valid = isValidMercadoPagoSignature({
      secret,
      signatureHeader: header,
      requestIdHeader: "r",
      dataId: "2",
    });

    expect(valid).toBe(false);
  });

  test("refuses a notice signed with another secret", () => {
    const header = mercadoPagoSignatureFor({
      secret: "other",
      dataId: "1",
      requestId: "r",
      ts: "1",
    });

    const valid = isValidMercadoPagoSignature({
      secret,
      signatureHeader: header,
      requestIdHeader: "r",
      dataId: "1",
    });

    expect(valid).toBe(false);
  });

  test("refuses a missing or malformed header", () => {
    expect(
      isValidMercadoPagoSignature({
        secret,
        signatureHeader: null,
        requestIdHeader: "r",
        dataId: "1",
      }),
    ).toBe(false);
    expect(
      isValidMercadoPagoSignature({
        secret,
        signatureHeader: "v1=abc",
        requestIdHeader: "r",
        dataId: "1",
      }),
    ).toBe(false);
  });
});
