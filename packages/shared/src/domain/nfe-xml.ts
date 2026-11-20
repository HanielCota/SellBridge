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

/** Markup that holds text, not elements: a tag inside it is no part of the note. */
const HIDDEN_TEXT = [
  { open: "<!--", close: "-->" },
  { open: "<![CDATA[", close: "]]>" },
] as const;

/**
 * The XML without comments and CDATA sections, or null when one is never closed. One pass with
 * `indexOf`, so a crafted file still costs linear time.
 */
function withoutHiddenText(xml: string): string | null {
  // Each marker's next place, looked up again only once the scan has passed it.
  const nextAt = HIDDEN_TEXT.map((marker) => xml.indexOf(marker.open));
  const kept: string[] = [];
  let position = 0;
  for (;;) {
    let markerIndex = -1;
    for (const [index, at] of nextAt.entries()) {
      const best = markerIndex === -1 ? -1 : (nextAt[markerIndex] ?? -1);
      if (at !== -1 && (best === -1 || at < best)) {
        markerIndex = index;
      }
    }
    const marker = HIDDEN_TEXT[markerIndex];
    const start = nextAt[markerIndex];
    if (marker === undefined || start === undefined) {
      kept.push(xml.slice(position));
      return kept.join("");
    }
    kept.push(xml.slice(position, start));
    const end = xml.indexOf(marker.close, start + marker.open.length);
    if (end === -1) {
      return null;
    }
    position = end + marker.close.length;
    for (const [index, at] of nextAt.entries()) {
      const open = HIDDEN_TEXT[index]?.open;
      if (at !== -1 && at < position && open !== undefined) {
        nextAt[index] = xml.indexOf(open, position);
      }
    }
  }
}

const TAG_NAME_END = /[\s/>]/;

/** Where the element `name` opens from `from`, its name ending there (not `<infNFeSupl`); -1 if never. */
function tagStart(xml: string, name: string, from = 0): number {
  const open = `<${name}`;
  for (let at = xml.indexOf(open, from); at !== -1; at = xml.indexOf(open, at + open.length)) {
    if (TAG_NAME_END.test(xml.charAt(at + open.length))) {
      return at;
    }
  }
  return -1;
}

function occurrences(xml: string, name: string): number {
  let count = 0;
  for (let at = tagStart(xml, name); at !== -1; at = tagStart(xml, name, at + name.length + 1)) {
    count += 1;
  }
  return count;
}

/** The body of the first `infProt` inside `protNFe`, SEFAZ's answer about the note. */
function protocolOf(xml: string): string | null {
  const protocolStart = xml.indexOf("<protNFe");
  if (protocolStart === -1) {
    return null;
  }
  const infProtStart = tagStart(xml, "infProt", protocolStart);
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
  const start = tagStart(xml, "infNFe");
  const opening = start === -1 ? null : textBetween(xml, "<infNFe", ">", start);
  if (opening === null) {
    return null;
  }
  return textBetween(opening, 'Id="NFe', '"');
}

/** The note's access key, or why the file is not an authorized NF-e, in the reseller's words. */
export function readAuthorizedNfeXml(file: string): NfeXmlReading {
  const xml = withoutHiddenText(file);
  if (xml === null || !xml.includes("<nfeProc") || !xml.includes("<protNFe")) {
    return { accessKey: null, problem: NOT_NFE };
  }
  // One note and one answer of SEFAZ: a second one would leave which is which to chance.
  if (occurrences(xml, "infProt") !== 1 || occurrences(xml, "infNFe") !== 1) {
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
