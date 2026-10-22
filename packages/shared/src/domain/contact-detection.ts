/**
 * Finds contact details in free text a reseller sends a supplier, or the other way round:
 * phones, e-mails, WhatsApp and Telegram links, sites, social network users. Both sides must
 * keep the sale inside SellBridge, so the shipment fields refuse any of them.
 *
 * It looks through the usual disguises: digits pulled apart, numbers spelled out, letters for
 * digits, invisible characters, "arroba" and "ponto com". It leaves alone what shipment notes
 * are made of: order numbers, CEP, prices, quantities, tracking codes, dates and times.
 */
import { hasPhone } from "./contact-phone.ts";

export type ContactKind = "phone" | "email" | "link" | "social";

/** The order the kinds are listed in, whatever order they appear in the text. */
const KIND_ORDER: readonly ContactKind[] = ["phone", "email", "link", "social"];

/**
 * The text is read in windows of this many characters, so the patterns stay fast on any input
 * (a 100 KB note took 20 s in one piece). Windows overlap by `WINDOW_OVERLAP`, longer than any
 * contact, so one written across two windows is still found whole in the second.
 */
export const CONTACT_SCAN_LIMIT = 2000;
const WINDOW_OVERLAP = 200;

/**
 * Past this many characters nothing more is read. The longest field that uses the detector (a
 * product description) holds 20,000; its own length check refuses anything longer.
 */
const LONGEST_SCANNED_TEXT = 25_000;

/** Compatibility forms folded ("１１" and "＠" read as "11" and "@"), invisible characters gone. */
function foldedText(text: string): string {
  return text.normalize("NFKC").replace(/\p{Cf}/gu, "");
}

/** Lowercase and without accents, for the rules that read words. */
function plainText(folded: string): string {
  return folded.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

const EMAIL = /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){1,4}/u;

const MAIL_PROVIDER = String.raw`(?:gmail|hotmail|outlook|yahoo|icloud|bol|uol|live|terra|protonmail)`;

/** "fulano@gmail" or "fulano.silva gmail com": the provider names the mailbox on its own. */
const PROVIDER_MAILBOX = new RegExp(
  String.raw`[a-z0-9._%+-]{1,64}@${MAIL_PROVIDER}(?![a-z])|[a-z0-9_]{1,40}[._][a-z0-9_.]{1,40}\s+${MAIL_PROVIDER}(?![a-z])`,
);

/** "arroba", "(at)", "{dot}", "(.)", ",com", "f u l a n o": written-out e-mails put back together. */
function spelledEmail(plain: string): string {
  return plain
    .replace(/(?<=(?:^|\s)\S) (?=\S(?:\s|$))/g, "")
    .replace(/\s*[([{]\s*(?:arroba|at)\s*[)\]}]\s*/g, "@")
    .replace(/\s+(?:arroba|at)\s+/g, "@")
    .replace(/\s*[([{]\s*(?:ponto|dot|\.)\s*[)\]}]\s*/g, ".")
    .replace(/\s+(?:ponto|dot)\s+/g, ".")
    .replace(/,(?=(?:com|br|net|org)\b)/g, ".")
    .replace(/\s*@\s*/g, "@")
    .replace(/(?<=@[^\s@]{0,64})\s*\.\s*/g, ".");
}

function hasEmail(plain: string): boolean {
  const spelled = spelledEmail(plain);
  return EMAIL.test(spelled) || PROVIDER_MAILBOX.test(spelled);
}

const LINK = /(?:https?:\/\/|www\.)\S+/iu;

const MESSAGING_LINK =
  /(?:wa\.me|wa\.link|whatsapp\.com|t\.me|telegram\.me|linktr\.ee|instagr\.am)(?![\p{L}\p{N}-])/iu;

/**
 * A bare domain. Its last part is matched in lowercase, and ".com" not before a lowercase word,
 * so "Chegou.Com cuidado" and "embalar.com cuidado" are sentences, not sites.
 */
const DOMAIN =
  /(?<![\p{L}\p{N}@.-])[\p{L}\p{N}][\p{L}\p{N}-]{0,62}(?:\.[\p{L}\p{N}-]{1,63}){0,3}\.(?:com(?!\s+\p{Ll})|net|org|br|io|me|co|xyz|tv|ee|am|shop|store|online|site|app|info|biz|link|ly)(?![\p{L}\p{N}-])/u;

/** "MINHALOJA.COM.BR": a Brazilian domain in any case. */
const BRAZILIAN_DOMAIN =
  /[\p{L}\p{N}][\p{L}\p{N}-]{0,62}\.(?:com|net|org|gov|edu)\.br(?![\p{L}\p{N}])/iu;

/** "minhaloja . com . br", "minhaloja ponto com ponto br": a domain spelled out. */
function spelledDomain(plain: string): string {
  return plain
    .replace(/\s+(?:ponto|dot)\s+/g, ".")
    .replace(/\s*\.\s*(?=(?:com|net|org|br)(?![a-z]))/g, ".");
}

function hasLink(folded: string, plain: string): boolean {
  const spelled = spelledDomain(plain);
  return (
    LINK.test(folded) ||
    MESSAGING_LINK.test(folded) ||
    DOMAIN.test(folded) ||
    BRAZILIAN_DOMAIN.test(folded) ||
    BRAZILIAN_DOMAIN.test(spelled)
  );
}

const HANDLE = /(?<![\p{L}\p{N}_.])@[\p{L}\p{N}_.]{2,}/u;

const NETWORK = String.raw`(?:instagram|insta|ig|facebook|face|fb|tik\s?tok|tt|telegram|tg|kwai|twitter|threads|whatsapp|whats|zap|wpp|discord|skype|messenger)`;

/** Networks named in full: whatever word follows them is read as the user. */
const NAMED_NETWORK = String.raw`(?:instagram|insta|facebook|tik\s?tok|telegram|whatsapp|kwai|twitter|discord)`;

/** Words that may follow a network's name in a normal sentence ("Pedido do TikTok Shop"). */
const NOT_A_USER = String.raw`(?:shop|loja|de|do|da|dos|das|e|ou|que|nao|não|no|na|pra|para|com|sem|mas|foi|tambem|também)(?![\p{L}\p{N}_.])`;

/** "insta: fulano", "meu face é fulano", "insta - fulano": the network, a sign, then the user. */
const NAMED_USER = new RegExp(
  String.raw`(?<![a-z])${NETWORK}\s*(?:[:=>-]|é|eh)\s*@?[\p{L}\p{N}_.]{3,40}`,
  "u",
);

/** "instagram fulano_loja": a user that cannot be a word, or any user after a network in full. */
const BARE_USER = new RegExp(
  String.raw`(?<![a-z])(?:${NETWORK}\s+@?(?=[\p{L}\p{N}_.]{0,40}[0-9_.])|${NAMED_NETWORK}\s+@?(?!${NOT_A_USER}))[\p{L}\p{N}_.]{3,40}`,
  "u",
);

/** Digits typed for the letters they look like, so "1nsta" and "inst4" read as "insta". */
function networkSpelling(lower: string): string {
  return lower.replace(/[1430]/g, (digit) => ({ 1: "i", 4: "a", 3: "e", 0: "o" })[digit] ?? digit);
}

function hasSocialUser(folded: string): boolean {
  const lower = folded.toLowerCase();
  const network = networkSpelling(lower);
  return (
    HANDLE.test(folded.replace(/@\s+/gu, "@")) ||
    NAMED_USER.test(network) ||
    BARE_USER.test(network)
  );
}

function kindsInWindow(window: string): ReadonlySet<ContactKind> {
  const folded = foldedText(window);
  const plain = plainText(folded);
  const found: Record<ContactKind, boolean> = {
    phone: hasPhone(plain),
    email: hasEmail(plain),
    link: hasLink(folded, plain),
    social: hasSocialUser(folded),
  };
  return new Set(KIND_ORDER.filter((kind) => found[kind]));
}

/** Overlapping slices of `text` of at most `CONTACT_SCAN_LIMIT` characters each. */
function readingWindows(text: string): string[] {
  const readable = text.slice(0, LONGEST_SCANNED_TEXT);
  const step = CONTACT_SCAN_LIMIT - WINDOW_OVERLAP;
  const starts = Array.from(
    { length: Math.max(1, Math.ceil((readable.length - WINDOW_OVERLAP) / step)) },
    (_, index) => index * step,
  );
  return starts.map((start) => readable.slice(start, start + CONTACT_SCAN_LIMIT));
}

/** The kinds of contact in `text`, each once, in `KIND_ORDER`; empty when there is none. */
export function findContactDetails(text: string): ContactKind[] {
  const found = new Set(readingWindows(text).flatMap((window) => [...kindsInWindow(window)]));
  return KIND_ORDER.filter((kind) => found.has(kind));
}
