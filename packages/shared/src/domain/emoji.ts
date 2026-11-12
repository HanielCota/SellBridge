/**
 * Emojis in product text. Mercado Livre refuses them in a description (`item.description.type.invalid`,
 * official "Descrição de produtos" page), so SellBridge never stores them: forms refuse them and
 * imports drop them.
 */

/**
 * One emoji or a piece that builds one (skin tone, flag letter, keycap, joiner, variation
 * selector). ©, ® and ™ are ordinary text in brand names and stay.
 */
const EMOJI = String.raw`(?:(?![©®™])\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[‍⃣︎️]|[\u{E0020}-\u{E007F}])`;
const EMOJI_RUN_WITH_SPACES = new RegExp(String.raw`[^\S\n]*${EMOJI}+[^\S\n]*`, "gu");
const EMOJI_TEST = new RegExp(EMOJI, "u");
/** A whole emoji as people see it, joined pieces included, to name it back to them. */
const VISIBLE_EMOJI = new RegExp(
  String.raw`(?:\p{Regional_Indicator}{2}|[#*\d]️?⃣|(?:(?![©®™])\p{Extended_Pictographic})(?:\p{Emoji_Modifier}|[︎️])*(?:‍(?:(?![©®™])\p{Extended_Pictographic})(?:\p{Emoji_Modifier}|[︎️])*)*)`,
  "gu",
);
/** How many emojis a message names: enough to find them, short enough to read. */
const NAMED_EMOJIS = 3;

export function hasEmoji(text: string): boolean {
  return EMOJI_TEST.test(text);
}

function withoutEmojiOnLine(line: string): string {
  const cleaned = line.replaceAll(EMOJI_RUN_WITH_SPACES, " ");
  if (cleaned === line) {
    return line;
  }
  return cleaned.trim();
}

/**
 * The text without emojis. Words an emoji stood between keep one space; a line that had an emoji
 * loses the spaces left at its ends; lines without one stay as they are.
 */
export function removeEmojis(text: string): string {
  if (hasEmoji(text)) {
    return text.split("\n").map(withoutEmojiOnLine).join("\n").trim();
  }
  return text;
}

/** The first emojis of the text, each once, as the person sees them ("🔥 ✅"). */
export function namedEmojis(text: string): string {
  const found = new Set(text.match(VISIBLE_EMOJI) ?? []);
  return [...found].slice(0, NAMED_EMOJIS).join(" ");
}

const PRODUCT_COUNT = new Intl.NumberFormat("pt-BR");

/** Told after an import that took emojis out of descriptions; null when it took none. */
export function emojisRemovedNotice(products: number): string | null {
  if (products <= 0) {
    return null;
  }
  const which = products === 1 ? "1 produto" : `${PRODUCT_COUNT.format(products)} produtos`;
  return `Tiramos os emojis da descrição de ${which}: o Mercado Livre não aceita.`;
}

/** The refusal shown under a description that has emojis, naming them so they are easy to find. */
export function emojiRefusalMessage(text: string): string {
  const named = namedEmojis(text);
  const list = named === "" ? "" : ` (${named})`;
  return `A descrição tem emojis${list}, e o Mercado Livre não aceita. Tire os emojis para salvar.`;
}
