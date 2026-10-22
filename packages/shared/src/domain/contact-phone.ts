/**
 * Brazilian phone numbers in free text, through the disguises people use: digits pulled apart by
 * any separator, numbers spelled out, letters that look like digits, a digit too many, two
 * numbers in a row. Order numbers, CEP, prices, tracking codes, dates and times are left alone.
 * Works on text already lowercased, without accents and invisible characters (`plainText`).
 */

/** Spoken digits, and the two-digit area codes people say as one word. */
const NUMBER_WORDS: Readonly<Record<string, string>> = {
  zero: "0",
  um: "1",
  uma: "1",
  dois: "2",
  duas: "2",
  tres: "3",
  quatro: "4",
  cinco: "5",
  seis: "6",
  meia: "6",
  sete: "7",
  oito: "8",
  nove: "9",
  onze: "11",
  doze: "12",
  treze: "13",
  quatorze: "14",
  catorze: "14",
  quinze: "15",
  dezesseis: "16",
  dezessete: "17",
  dezoito: "18",
  dezenove: "19",
};

const NUMBER_WORD = new RegExp(
  `(?<![a-z])(?:${Object.keys(NUMBER_WORDS).join("|")})(?![a-z])`,
  "g",
);

/** Letters typed for the digit they look like, only right next to a digit: "9O765", "1l98…". */
const LOOKALIKE_DIGITS: ReadonlyMap<string, string> = new Map([
  ["o", "0"],
  ["l", "1"],
  ["i", "1"],
  ["s", "5"],
]);
const LOOKALIKE = /(?<=\d)[olis](?![a-z])|(?<![a-z])[olis](?=\d)/g;

/** Codes that are all digits and letters but never a phone: tracking, listings, simulated sales. */
const NON_CONTACT_CODES = /[a-z]{2}\d{9}[a-z]{2}|mlb\d+|sim-[a-z0-9]+/g;

/** Up to five of the characters people put between digits; a slash or a letter ends the run. */
const SEPARATOR = String.raw`[\s().\-_*,:–—]{0,5}`;
const DIGIT_RUN = new RegExp(String.raw`\d(?:${SEPARATOR}\d)*`, "g");

/** A price as written in Brazil: thousands with dots and the cents after a comma. */
const PRICE_SHAPE = /^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$|^\d+,\d{2}$/;

/** A landline without area code needs its separator ("3333-4444"): eight bare digits are a CEP. */
const LANDLINE_SHAPE = /^\d{4}[\s.-]\d{4}$/;

/** A short number right after these words is the document they name, not a phone. */
const DOCUMENT_BEFORE =
  /(?:nota|fiscal|nf|nfe|codigo|cod|protocolo|rastreio|rastreamento|lote|sku|ref|(?:pedido|numero|nota)\s*(?:no|n\.|#)?)\s*[:#.]?\s*$/;

/** The longest digit string a phone takes: 55 + area code + nine digits. */
const LONGEST_PHONE = 13;

function spelledAsDigits(text: string): string {
  return text
    .replace(NUMBER_WORD, (word) => NUMBER_WORDS[word] ?? word)
    .replace(/(?<![a-z\d])0\s*x\s*x\s*/g, "0")
    .replace(LOOKALIKE, (letter) => LOOKALIKE_DIGITS.get(letter) ?? letter)
    .replace(NON_CONTACT_CODES, " ");
}

/** Drops the country code (55) and the trunk prefix (0) a long-distance call adds. */
function nationalDigits(digits: string): string {
  if (digits.length >= 11 && digits.startsWith("0")) {
    return nationalDigits(digits.slice(1));
  }
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits;
}

function hasAreaCode(digits: string): boolean {
  return /^[1-9][1-9]/.test(digits);
}

interface Candidate {
  digits: string;
  /** The candidate as typed, separators included. */
  shape: string;
  /** Right after a word that names a document ("nota fiscal 9876…"). */
  afterDocumentWord: boolean;
}

function isPhoneNumber({ digits: typed, shape, afterDocumentWord }: Candidate): boolean {
  const digits = nationalDigits(typed);
  if (digits.length === 8) {
    return !afterDocumentWord && /^[2-5]/.test(digits) && LANDLINE_SHAPE.test(shape);
  }
  if (digits.length === 9) {
    return !afterDocumentWord && digits.startsWith("9");
  }
  if (digits.length === 10) {
    return hasAreaCode(digits) && /^[2-5]/.test(digits.slice(2));
  }
  if (digits.length === 11) {
    return hasAreaCode(digits) && digits[2] === "9";
  }
  return false;
}

/**
 * Every stretch of consecutive digit groups in a run that is short enough to be a phone: catches
 * a number with a digit added before or after it, and two numbers typed one after the other.
 */
function candidatesIn(run: string, afterDocumentWord: boolean): Candidate[] {
  const groups = Array.from(run.matchAll(/\d+/g));
  return groups.flatMap((first, start) => {
    const found: Candidate[] = [];
    let digits = "";
    for (const group of groups.slice(start)) {
      digits += group[0];
      if (digits.length > LONGEST_PHONE) {
        break;
      }
      const shape = run.slice(first.index, group.index + group[0].length);
      found.push({ digits, shape, afterDocumentWord: afterDocumentWord && start === 0 });
    }
    return found;
  });
}

/** Whether `plain` (see `plainText`) holds a Brazilian phone number. */
export function hasPhone(plain: string): boolean {
  const text = spelledAsDigits(plain);
  return Array.from(text.matchAll(DIGIT_RUN)).some((match) => {
    const run = match[0];
    if (PRICE_SHAPE.test(run)) {
      return false;
    }
    const before = text.slice(Math.max(0, match.index - 24), match.index);
    return candidatesIn(run, DOCUMENT_BEFORE.test(before)).some(isPhoneNumber);
  });
}
