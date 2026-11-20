import { describe, expect, it } from "vitest";
import { MAX_NFE_XML_BYTES, readAuthorizedNfeXml } from "./nfe-xml.ts";

const KEY = "35261111222333000181550010000048211123456789";

function nfeProc(input: { id?: string; key?: string; status?: string } = {}): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
    `<NFe><infNFe versao="4.00" Id="NFe${input.id ?? KEY}"><ide><nNF>4821</nNF></ide></infNFe></NFe>`,
    `<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${input.key ?? KEY}</chNFe>`,
    `<cStat>${input.status ?? "100"}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`,
    "</nfeProc>",
  ].join("");
}

describe("readAuthorizedNfeXml", () => {
  it("reads the key of an authorized note", () => {
    expect(readAuthorizedNfeXml(nfeProc())).toEqual({ accessKey: KEY, problem: null });
  });

  it("accepts a note authorized out of time (150)", () => {
    expect(readAuthorizedNfeXml(nfeProc({ status: "150" })).accessKey).toBe(KEY);
  });

  it("refuses a note SEFAZ has not authorized", () => {
    expect(readAuthorizedNfeXml(nfeProc({ status: "301" })).problem).toMatch(
      /ainda não foi autorizada/,
    );
  });

  it("refuses a file that is not an NF-e with its protocol", () => {
    expect(readAuthorizedNfeXml("<html>danfe</html>").problem).toMatch(/não é o XML de uma NF-e/);
  });

  it("refuses a protocol that names another note than the file's", () => {
    const other = "35261111222333000181550010000048221123456780";

    expect(readAuthorizedNfeXml(nfeProc({ key: other })).problem).toMatch(/não é o XML/);
  });

  it("reads a crafted file of repeated tags in linear time", () => {
    const opening = "<nfeProc><protNFe><infProt>";
    const filler = "<infNFe <protNFe <infProt ".repeat(MAX_NFE_XML_BYTES / 26);
    const startedAt = performance.now();

    const reading = readAuthorizedNfeXml(opening + filler);

    expect(reading.problem).not.toBeNull();
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});
