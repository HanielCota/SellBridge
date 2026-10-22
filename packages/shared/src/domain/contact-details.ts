/** What stands in for a contact detail removed from a text other tenants will read. */
export const REDACTED = "[removido]";

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

const LINK = /(?:https?:\/\/|www\.)\S+/giu;

/**
 * A bare domain such as "minhaloja.com.br" or "loja.shop/produto". Top-level domains are matched
 * in lowercase only, so a missing space after a full stop ("Chegou.Com cuidado") is left alone.
 */
const TOP_LEVEL_DOMAINS = [
  "com",
  "net",
  "org",
  "br",
  "io",
  "shop",
  "store",
  "online",
  "site",
  "app",
  "info",
  "biz",
  "link",
  "ly",
].join("|");
const DOMAIN = new RegExp(
  String.raw`(?<![\p{L}\p{N}@.-])[\p{L}\p{N}][\p{L}\p{N}-]*(?:\.[\p{L}\p{N}-]+)*` +
    String.raw`\.(?:${TOP_LEVEL_DOMAINS})(?![\p{L}\p{N}-])(?:/\S*)?`,
  "gu",
);

/** An "@minhaloja" handle (Instagram, Telegram): a store name in all but name. */
const HANDLE = /(?<![\p{L}\p{N}_.])@[\p{L}\p{N}_.]{2,}/gu;

/**
 * Eight or more digits with the separators people type between them: phone numbers with or
 * without area code ("(11) 98765-4321", "+55 11 98765 4321", "98765-4321"), CPF and CNPJ
 * ("123.456.789-09", "12.345.678/0001-90"). Prices ("R$ 1.299,90") and dates stay short of it.
 */
const DIGIT_RUN = /(?<![\p{L}\d])(?:\+\s?)?\(?\d(?:[\s()./-]{0,3}\d){7,}(?![\p{L}\d])/gu;

/**
 * More digits than a CNPJ (14) is an order number ("2000012345678901"): it says which sale the
 * review is about, so it stays. Digits glued to letters (MLB…, tracking codes) never match.
 */
const LONGEST_REDACTED_DIGITS = 14;

/** A date like "12/09/2026" or "12/09": kept, so the digit rule can skip it. */
const DATE = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/u;

function redactDigitRun(match: string): string {
  const digits = match.replace(/\D/g, "").length;
  return DATE.test(match.trim()) || digits > LONGEST_REDACTED_DIGITS ? match : REDACTED;
}

/**
 * Removes what could identify the reviewer or a buyer from a free-text comment shown to other
 * tenants: e-mails, links and domains, @handles, phone numbers, CPF and CNPJ. Each one becomes
 * "[removido]"; the rest of the text is kept as written (in its compatibility form).
 */
export function redactContactDetails(text: string): string {
  // Compatibility forms first: full-width "１１９８７…" and "＠", and mathematical "𝟏𝟏…", read as
  // plain digits and "@", so they cannot slip past the rules below.
  return text
    .normalize("NFKC")
    .replace(EMAIL, REDACTED)
    .replace(LINK, REDACTED)
    .replace(DOMAIN, REDACTED)
    .replace(HANDLE, REDACTED)
    .replace(DIGIT_RUN, redactDigitRun);
}
