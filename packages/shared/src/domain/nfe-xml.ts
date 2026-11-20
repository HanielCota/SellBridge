/**
 * What SellBridge reads in an NF-e's XML (`nfeProc`, the note with SEFAZ's protocol): only enough
 * to know it is an authorized note and which one. The file itself goes on to the marketplace as is.
 */

/** An NF-e's XML is tens of kilobytes; a much larger file is not one. */
export const MAX_NFE_XML_BYTES = 1_000_000;

/** SEFAZ's `cStat` of an authorized NF-e: 100 on time, 150 authorized out of time. */
const AUTHORIZED_STATUSES = new Set(["100", "150"]);

const NOT_NFE =
  "Este arquivo não é o XML de uma NF-e autorizada. Baixe no seu sistema o XML da nota (o arquivo .xml, não o PDF) e envie de novo.";
const NOT_AUTHORIZED =
  "Esta nota ainda não foi autorizada pela SEFAZ. Envie o XML depois que ela for autorizada.";

export type NfeXmlReading =
  | { readonly accessKey: string; readonly problem: null }
  | { readonly accessKey: null; readonly problem: string };

function firstMatch(xml: string, pattern: RegExp): string | null {
  return pattern.exec(xml)?.[1] ?? null;
}

/** The note's access key, or why the file is not an authorized NF-e, in the reseller's words. */
export function readAuthorizedNfeXml(xml: string): NfeXmlReading {
  if (!xml.includes("<nfeProc") || !xml.includes("<protNFe")) {
    return { accessKey: null, problem: NOT_NFE };
  }
  const protocol = firstMatch(xml, /<protNFe[\s\S]*?<infProt[^>]*>([\s\S]*?)<\/infProt>/);
  const accessKey = protocol === null ? null : firstMatch(protocol, /<chNFe>(\d{44})<\/chNFe>/);
  const noteId = firstMatch(xml, /<infNFe[^>]*\bId="NFe(\d{44})"/);
  if (protocol === null || accessKey === null || noteId !== accessKey) {
    return { accessKey: null, problem: NOT_NFE };
  }
  const status = firstMatch(protocol, /<cStat>(\d+)<\/cStat>/);
  if (status === null || !AUTHORIZED_STATUSES.has(status)) {
    return { accessKey: null, problem: NOT_AUTHORIZED };
  }
  return { accessKey, problem: null };
}
