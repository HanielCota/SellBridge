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

  it("ignores a protocol written inside a comment before the real one", () => {
    const other = "35261121611372000396550010000000101876543210";
    const fake = `<!-- <protNFe><infProt><chNFe>${other}</chNFe><cStat>100</cStat></infProt></protNFe> -->`;

    const reading = readAuthorizedNfeXml(nfeProc().replace("<protNFe", `${fake}<protNFe`));

    expect(reading).toEqual({ accessKey: KEY, problem: null });
  });

  it("refuses a file with two answers of SEFAZ", () => {
    const protocol = `<protNFe versao="4.00"><infProt><chNFe>${KEY}</chNFe><cStat>100</cStat></infProt></protNFe>`;

    const reading = readAuthorizedNfeXml(nfeProc().replace("</nfeProc>", `${protocol}</nfeProc>`));

    expect(reading.problem).toMatch(/não é o XML/);
  });

  it("refuses a file whose comment never closes", () => {
    expect(readAuthorizedNfeXml(`<!-- ${nfeProc()}`).problem).toMatch(/não é o XML/);
  });

  it("reads a crafted file of repeated comment openings in linear time", () => {
    const filler = "<!-- --> <![CDATA[ ]]> ".repeat(MAX_NFE_XML_BYTES / 24);
    const startedAt = performance.now();

    readAuthorizedNfeXml(filler + nfeProc());

    expect(performance.now() - startedAt).toBeLessThan(500);
  });

  it("reads a note whose tag breaks the line before its attributes", () => {
    const xml = nfeProc().replace("<infNFe versao", "<infNFe\n  versao");

    expect(readAuthorizedNfeXml(xml)).toEqual({ accessKey: KEY, problem: null });
  });

  it("refuses two notes even when one tag breaks the line before its attributes", () => {
    const other = "35261121611372000396550010000000101876543210";
    const second = `<NFe><infNFe\tId="NFe${other}"></infNFe></NFe>`;

    const reading = readAuthorizedNfeXml(nfeProc().replace("<NFe>", `${second}<NFe>`));

    expect(reading.problem).toMatch(/não é o XML/);
  });
});
