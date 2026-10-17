import { BRAZILIAN_STATES } from "@sellbridge/shared/brazilian-states";
import type { DeliveryAddress } from "@sellbridge/shared/schemas";
import { stripAccents } from "@sellbridge/shared/text";

/** What a shipping label told about the buyer's address: only the fields it actually had. */
export type LabelAddress = Partial<DeliveryAddress>;
type AddressKey = keyof DeliveryAddress;

const RECIPIENT_HEADER =
  /^(?:destinat[áa]rio|destino|entregar\s+(?:a|para)|enviar\s+para|para\s*:)\s*:?\s*/i;
const SENDER_HEADER = /^(?:remetente|origem|de\s*:)/i;
/** Lines read after the recipient header when no sender block closes it. */
const MAX_BLOCK_LINES = 10;
const POSTAL_CODE = /(?<![\d-])(\d{5})[-.\s]?(\d{3})(?![\d-])/;
const LABELLED_SEGMENT =
  /\s+(?=(?:bairro|cidade|munic[íi]pio|uf|estado|cep|complemento|n[úu]mero)\s*:)/i;
const FIELD_LABELS: ReadonlyArray<readonly [AddressKey, RegExp]> = [
  ["street", /^(?:endere[çc]o|logradouro)\s*:\s*/i],
  ["number", /^n[úu]mero\s*:\s*/i],
  ["complement", /^complemento\s*:\s*/i],
  ["neighborhood", /^bairro\s*:\s*/i],
  ["city", /^(?:cidade|munic[íi]pio)\s*:\s*/i],
  ["state", /^(?:uf|estado)\s*:\s*/i],
];
/** Lines a label prints around the address that are never part of it. */
const IGNORED_LINE =
  /^(?:refer[êe]ncia|obs|observa[çc][ãa]o|tel|telefone|celular|cpf|cnpj|nf|nota fiscal|pedido|venda|envio|rastreio|pack|peso|volume|danfe|data)\b/i;
const STREET_PREFIX =
  /^(?:rua|r\.|av\.?|avenida|alameda|al\.|travessa|trav\.?|tv\.?|estrada|estr\.?|rodovia|rod\.|pra[çc]a|p[çc]a\.?|largo|ladeira|viela|vila|beco|passagem|servid[ãa]o|quadra|qd\.?|setor|conjunto)\s/i;
const COMPLEMENT_PREFIX =
  /^(?:apto?\.?|apartamento|bloco|bl\.?|casa|sala|loja|fundos|lote|lt\.?|andar|cj\.?|conj\.?|torre|edif[íi]cio|ed\.)(?:\s|\d|$)/i;
const HOUSE_NUMBER = /^(?:n[º°o.]\s*)?(\d+[a-z]?|s\/?n),?$/i;
const NUMBER_MARK = /^n[º°o.]?$/i;
/** "Rua 7 de Setembro": a number followed by these words belongs to the street name. */
const NAME_CONNECTOR = /^(?:de|do|da|dos|das)$/i;
const COMMA_NUMBER = /^(.+?)\s*,\s*(?:n[º°o.]?\s*)?(\d+[a-z]?|s\/?n)\b\s*[,\-–]?\s*(.*)$/i;
const CITY_STATE = /^(.+?)\s*(?:[/,\-–]\s*|\s+)([A-Za-z]{2})\.?$/;
// prettier-ignore
const STATE_NAMES: Readonly<Record<string, string>> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

/** Reads the recipient's address from the text of a shipping label (PDF, ZPL or plain text). */
export function parseShippingLabel(text: string): LabelAddress {
  const block = recipientBlock(normalizedLines(text));
  const kept = block.lines.filter((line) => !IGNORED_LINE.test(line));
  const labelled = labelledFields(kept);
  const postal = findPostalCode(kept);
  const free = kept.filter((line) => !isLabelled(line));
  const place = postal === null ? {} : cityFromPostalLine(postal.line);
  const unlabelled = unlabelledFields(free, postal?.line ?? null, block.recipient);
  return compact({ ...unlabelled, ...place, ...labelled, postalCode: postal?.code });
}

function normalizedLines(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/** The lines under "Destinatário", up to the sender's block; the whole label when it has no header. */
function recipientBlock(lines: readonly string[]) {
  const start = lines.findIndex((line) => RECIPIENT_HEADER.test(line));
  if (start === -1) return { lines, recipient: false };
  const header = (lines[start] ?? "").replace(RECIPIENT_HEADER, "").trim();
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => SENDER_HEADER.test(line));
  const body = rest.slice(0, end === -1 ? MAX_BLOCK_LINES : end);
  return { lines: header.length > 0 ? [header, ...body] : body, recipient: true };
}

function segments(line: string): readonly string[] {
  return line.split(LABELLED_SEGMENT);
}

function isLabelled(line: string): boolean {
  return segments(line).some(
    (segment) => /^cep\b/i.test(segment) || FIELD_LABELS.some(([, label]) => label.test(segment)),
  );
}

function labelledFields(lines: readonly string[]): LabelAddress {
  const entries = lines.flatMap(segments).flatMap((segment) => {
    const match = FIELD_LABELS.find(([, label]) => label.test(segment));
    if (match === undefined) return [];
    const [key, label] = match;
    return [[key, segment.replace(label, "").trim()] as const];
  });
  const fields: LabelAddress = Object.fromEntries(entries);
  if (fields.street === undefined || fields.number !== undefined) return fields;
  const { street, number, complement } = splitStreetLine(fields.street);
  const complements = [complement, fields.complement].filter(Boolean).join(" - ");
  return compact({ ...fields, street, number, complement: complements });
}

function findPostalCode(lines: readonly string[]) {
  const ordered = [...lines.filter((line) => /\bcep\b/i.test(line)), ...lines];
  for (const line of ordered) {
    const match = POSTAL_CODE.exec(line);
    if (match !== null) return { line, code: `${match[1]}-${match[2]}` };
  }
  return null;
}

/** "CEP 01310-100 - Bela Vista - São Paulo/SP": what follows the code is the place. */
function cityFromPostalLine(line: string): LabelAddress {
  const rest = line
    .replace(POSTAL_CODE, " ")
    .replace(/\bcep\b\s*:?/i, " ")
    .replace(/^[\s,\-–]+|[\s,\-–]+$/g, "");
  return splitCityState(rest) ?? {};
}

function splitCityState(text: string): LabelAddress | null {
  const named = stateFromName(text);
  if (named !== null) return named;
  const match = CITY_STATE.exec(text);
  const state = match?.[2]?.toUpperCase();
  if (match === null || state === undefined || !isState(state)) return null;
  return { ...splitNeighborhood(match[1] ?? ""), state };
}

/** "Campinas, São Paulo": a state written in full. */
function stateFromName(text: string): LabelAddress | null {
  const match = /^(.+?)\s*[/,\-–]\s*([^/,\-–]+)$/.exec(text);
  if (match === null) return null;
  const state =
    STATE_NAMES[
      stripAccents(match[2] ?? "")
        .toLowerCase()
        .trim()
    ];
  if (state === undefined) return null;
  return { ...splitNeighborhood(match[1] ?? ""), state };
}

/** "Bela Vista - São Paulo": a label may print the neighborhood before the city. */
function splitNeighborhood(text: string): LabelAddress {
  const parts = text.split(/\s+[-–]\s+/).map((part) => part.trim());
  const city = parts.at(-1) ?? "";
  if (parts.length < 2) return { city };
  return { neighborhood: parts.slice(0, -1).join(" - "), city };
}

function isState(value: string): boolean {
  return BRAZILIAN_STATES.some((state) => state === value);
}

/** Recipient, street line, complement and neighborhood, in the order labels print them. */
function unlabelledFields(lines: readonly string[], postalLine: string | null, header: boolean) {
  const candidates = lines.filter((line) => line !== postalLine);
  const streetIndex = findStreetIndex(candidates);
  const recipient = header ? recipientName(candidates[0]) : undefined;
  if (streetIndex === -1) return { recipient };
  const after = candidates.slice(streetIndex + 1).filter((line) => !isCityLine(line));
  const complements = after.filter((line) => COMPLEMENT_PREFIX.test(line));
  const neighborhood = after.find((line) => !COMPLEMENT_PREFIX.test(line));
  const street = splitStreetLine(candidates[streetIndex] ?? "");
  const cityLine = candidates.slice(streetIndex + 1).find(isCityLine);
  const place = cityLine === undefined ? {} : (splitCityState(cityLine) ?? {});
  const complement = [street.complement, ...complements].filter(Boolean).join(" - ");
  return {
    recipient: streetIndex === 0 ? undefined : recipient,
    ...street,
    complement,
    neighborhood,
    ...place,
  };
}

/** "Maria da Silva (MARIASILVA123)": the buyer's nickname is not part of the name. */
function recipientName(line: string | undefined): string | undefined {
  if (line === undefined || STREET_PREFIX.test(line) || isCityLine(line)) return undefined;
  return line.replace(/\s*\([^)]*\)\s*$/, "");
}

function findStreetIndex(lines: readonly string[]): number {
  const prefixed = lines.findIndex((line) => STREET_PREFIX.test(line));
  if (prefixed !== -1) return prefixed;
  return lines.findIndex((line, index) => index > 0 && splitStreetLine(line).number !== undefined);
}

/** A city line ends with a state after a separator: "São Paulo/SP", "Recife - PE". */
function isCityLine(line: string): boolean {
  return /[/,\-–]\s*[A-Za-z]{2}\.?$/.test(line) && splitCityState(line) !== null;
}

function splitStreetLine(line: string): LabelAddress {
  const comma = COMMA_NUMBER.exec(line);
  if (comma !== null) {
    return { street: comma[1] ?? "", number: comma[2] ?? "", complement: comma[3] ?? "" };
  }
  const tokens = line.split(" ");
  const index = tokens.findIndex(
    (token, position) =>
      position > 0 &&
      HOUSE_NUMBER.test(token) &&
      !NAME_CONNECTOR.test(tokens[position + 1] ?? "") &&
      !COMPLEMENT_PREFIX.test(tokens[position - 1] ?? ""),
  );
  if (index === -1) return { street: line };
  const streetTokens = tokens.slice(0, index).filter((token, position, all) => {
    return position < all.length - 1 || !NUMBER_MARK.test(token);
  });
  return {
    street: streetTokens.join(" ").replace(/,$/, ""),
    number: (tokens[index] ?? "").replace(/^n[º°o.]\s*/i, "").replace(/,$/, ""),
    complement: tokens
      .slice(index + 1)
      .join(" ")
      .replace(/^[,\-–]\s*/, ""),
  };
}

/** Drops empty values: a field the label did not have keeps what the form already holds. */
function compact(fields: Record<string, string | undefined>): LabelAddress {
  const entries = Object.entries(fields).flatMap(([key, value]) => {
    const trimmed = value?.trim() ?? "";
    if (trimmed.length === 0 || !isAddressKey(key)) return [];
    return [[key, key === "state" ? trimmed.toUpperCase() : trimmed] as const];
  });
  return Object.fromEntries(entries);
}

const ADDRESS_KEYS: readonly string[] = [
  "recipient",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "postalCode",
];
function isAddressKey(key: string): key is AddressKey {
  return ADDRESS_KEYS.includes(key);
}
