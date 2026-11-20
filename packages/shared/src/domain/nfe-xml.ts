/**
 * What SellBridge reads in an NF-e's XML (`nfeProc`, the note with SEFAZ's protocol): only enough
 * to know it is an authorized note and which one. The file itself goes on to the marketplace as is.
 */

/** An NF-e's XML is tens of kilobytes; a much larger file is not one. */
export const MAX_NFE_XML_BYTES = 1_000_000;

/** SEFAZ's `cStat` of an authorized NF-e: 100 on time, 150 authorized out of time. */
const AUTHORIZED_STATUSES = new Set(["100", "150"]);

const ACCESS_KEY_PATTERN = /^\d{44}$/;

const NOT_NFE =
  "Este arquivo não é o XML de uma NF-e autorizada. Baixe no seu sistema o XML da nota (o arquivo .xml, não o PDF) e envie de novo.";
const NOT_AUTHORIZED =
  "Esta nota ainda não foi autorizada pela SEFAZ. Envie o XML depois que ela for autorizada.";

export type NfeXmlReading =
  | { readonly accessKey: string; readonly problem: null }
  | { readonly accessKey: null; readonly problem: string };

/**
 * The text between the first `open` found from `from` and the `close` after it. Read with
 * `indexOf` rather than a regex: a crafted file of repeated tags then costs linear time.
 */
function textBetween(xml: string, open: string, close: string, from = 0): string | null {
  const start = xml.indexOf(open, from);
  if (start === -1) {
    return null;
  }
  const contentStart = start + open.length;
  const end = xml.indexOf(close, contentStart);
  if (end === -1) {
    return null;
  }
  return xml.slice(contentStart, end);
}

/** The body of the first `infProt` inside `protNFe`, SEFAZ's answer about the note. */
function protocolOf(xml: string): string | null {
  const protocolStart = xml.indexOf("<protNFe");
  if (protocolStart === -1) {
    return null;
  }
  const infProtStart = xml.indexOf("<infProt", protocolStart);
  if (infProtStart === -1) {
    return null;
  }
  const bodyStart = xml.indexOf(">", infProtStart);
  if (bodyStart === -1) {
    return null;
  }
  return textBetween(xml, ">", "</infProt>", bodyStart);
}

/** The 44 digits of the note's `infNFe Id="NFe…"`, read from its opening tag only. */
function noteIdOf(xml: string): string | null {
  const opening = textBetween(xml, "<infNFe", ">");
  if (opening === null) {
    return null;
  }
  return textBetween(opening, 'Id="NFe', '"');
}

/** The note's access key, or why the file is not an authorized NF-e, in the reseller's words. */
export function readAuthorizedNfeXml(xml: string): NfeXmlReading {
  if (!xml.includes("<nfeProc") || !xml.includes("<protNFe")) {
    return { accessKey: null, problem: NOT_NFE };
  }
  const protocol = protocolOf(xml);
  const accessKey = protocol === null ? null : textBetween(protocol, "<chNFe>", "</chNFe>");
  if (accessKey === null || !ACCESS_KEY_PATTERN.test(accessKey)) {
    return { accessKey: null, problem: NOT_NFE };
  }
  if (noteIdOf(xml) !== accessKey) {
    return { accessKey: null, problem: NOT_NFE };
  }
  const status = protocol === null ? null : textBetween(protocol, "<cStat>", "</cStat>");
  if (status === null || !AUTHORIZED_STATUSES.has(status)) {
    return { accessKey: null, problem: NOT_AUTHORIZED };
  }
  return { accessKey, problem: null };
}
