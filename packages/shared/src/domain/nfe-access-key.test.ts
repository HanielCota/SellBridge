import { describe, expect, it } from "vitest";
import {
  accessKeyFormatProblem,
  parseAccessKey,
  resellerAccessKeyProblem,
} from "./nfe-access-key.ts";

/** An NF-e of CNPJ 11.222.333/0001-81, series 1, number 4821, November 2026 (SP). */
const RESELLER_KEY = "35261111222333000181550010000048211123456789";
const RESELLER_CNPJ = "11222333000181";
/** The same layout, issued by another company. */
const OTHER_COMPANY_KEY = "35261121611372000396550010000000101876543210";
/** An NFC-e (model 65) of the reseller. */
const CONSUMER_RECEIPT_KEY = "35261111222333000181650010000000101876543210";

describe("parseAccessKey", () => {
  it("reads the issuer, model, series, number and month of the key", () => {
    expect(parseAccessKey(RESELLER_KEY)).toEqual({
      accessKey: RESELLER_KEY,
      yearMonth: "2611",
      issuerCnpj: RESELLER_CNPJ,
      model: "55",
      series: "1",
      number: "4821",
    });
  });

  it("takes the key in the groups of four the DANFE prints", () => {
    const grouped = RESELLER_KEY.replace(/(\d{4})/g, "$1 ").trim();

    expect(parseAccessKey(grouped)?.accessKey).toBe(RESELLER_KEY);
  });

  it("refuses a key whose check digit does not match", () => {
    expect(parseAccessKey(`${RESELLER_KEY.slice(0, -1)}0`)).toBeNull();
  });

  it("refuses a key that is not 44 digits", () => {
    expect(parseAccessKey(RESELLER_KEY.slice(1))).toBeNull();
    expect(parseAccessKey(`${RESELLER_KEY}1`)).toBeNull();
    expect(parseAccessKey("")).toBeNull();
    expect(parseAccessKey(`A${RESELLER_KEY.slice(1)}`)).toBeNull();
  });
});

describe("accessKeyFormatProblem", () => {
  it("accepts any well-formed key, whoever issued it", () => {
    expect(accessKeyFormatProblem(OTHER_COMPANY_KEY)).toBeNull();
  });

  it("asks for digits only when letters were pasted", () => {
    expect(accessKeyFormatProblem("NFe3526")).toBe(
      "A chave de acesso tem só números. Copie de novo da nota.",
    );
  });
});

describe("resellerAccessKeyProblem", () => {
  it("accepts the reseller's own NF-e", () => {
    expect(resellerAccessKeyProblem(RESELLER_KEY, RESELLER_CNPJ)).toBeNull();
  });

  it("says how many digits were pasted when the length is wrong", () => {
    expect(resellerAccessKeyProblem("3526 1111", RESELLER_CNPJ)).toBe(
      "A chave de acesso tem 44 números, e esta tem 8. Copie de novo da nota.",
    );
  });

  it("asks to copy again when a digit is swapped", () => {
    const swapped = `${RESELLER_KEY.slice(0, 30)}9${RESELLER_KEY.slice(31)}`;

    expect(resellerAccessKeyProblem(swapped, RESELLER_CNPJ)).toBe(
      "Esta chave não confere: algum número está trocado. Copie de novo da nota.",
    );
  });

  it("refuses a consumer receipt (NFC-e)", () => {
    expect(resellerAccessKeyProblem(CONSUMER_RECEIPT_KEY, RESELLER_CNPJ)).toBe(
      "Esta chave não é de uma NF-e (modelo 55). Use a chave da nota de venda ao comprador.",
    );
  });

  it("refuses a note issued by another company, naming both CNPJs", () => {
    expect(resellerAccessKeyProblem(OTHER_COMPANY_KEY, RESELLER_CNPJ)).toBe(
      "Esta nota foi emitida pelo CNPJ 21.611.372/0003-96. Use a nota emitida pela sua empresa, CNPJ 11.222.333/0001-81.",
    );
  });
});
