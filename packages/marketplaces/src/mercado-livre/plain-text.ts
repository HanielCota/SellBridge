/**
 * What Mercado Livre's `plain_text` description takes. The official "Descrição de produtos" page
 * (read on 2026-11-12): plain text only, no formatting, line breaks as `\n`; its refusal example
 * (`item.description.type.invalid`) points at the emoji. Hashtags are not mentioned there, so `#`
 * is kept.
 */

/**
 * Emojis and the pieces that build them (skin tones, flags, keycaps, joiners, variation
 * selectors). ©, ® and ™ are ordinary text in brand names and stay.
 */
const PICTOGRAPH = String.raw`(?:(?![©®™])\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[‍⃣︎️]|[\u{E0020}-\u{E007F}])`;
const PICTOGRAPH_RUN = new RegExp(String.raw`[^\S\n]*${PICTOGRAPH}+[^\S\n]*`, "gu");

/** Tags that end a line or a block become the `\n` the page asks for. */
const LINE_BREAK_TAG = /<(?:br\s*\/?|\/(?:p|div|li|h[1-6]|tr))\s*>/giu;
const HTML_TAG = /<\/?[a-z][a-z\d-]*(?:\s[^<>]*)?\/?>/giu;

function withoutPictographs(line: string): string {
  const cleaned = line.replaceAll(PICTOGRAPH_RUN, " ");
  if (cleaned === line) {
    return line;
  }
  return cleaned.trim();
}

/**
 * The description as Mercado Livre's `plain_text` accepts it: emojis and HTML tags out, line
 * breaks, accents and punctuation kept. Lines without an emoji are left as they are.
 *
 * @returns An empty string when nothing but emojis and tags was left.
 */
export function toMercadoLivrePlainText(description: string): string {
  const withoutTags = description
    .replaceAll(/\r\n?/gu, "\n")
    .replaceAll(LINE_BREAK_TAG, "\n")
    .replaceAll(HTML_TAG, "");
  return withoutTags.split("\n").map(withoutPictographs).join("\n").trim();
}
