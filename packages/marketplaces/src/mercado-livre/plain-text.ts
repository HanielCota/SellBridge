import { removeEmojis } from "@sellbridge/shared/emoji";

/**
 * What Mercado Livre's `plain_text` description takes. The official "Descrição de produtos" page
 * (read on 2026-11-12): plain text only, no formatting, line breaks as `\n`; its refusal example
 * (`item.description.type.invalid`) points at the emoji. Hashtags are not mentioned there, so `#`
 * is kept.
 */

/** Tags that end a line or a block become the `\n` the page asks for. */
const LINE_BREAK_TAG = /<(?:br\s*\/?|\/(?:p|div|li|h[1-6]|tr))\s*>/giu;
const HTML_TAG = /<\/?[a-z][a-z\d-]*(?:\s[^<>]*)?\/?>/giu;

/**
 * The description as Mercado Livre's `plain_text` accepts it: emojis and HTML tags out, line
 * breaks, accents and punctuation kept. Descriptions stored before emojis were refused may still
 * carry them.
 *
 * @returns An empty string when nothing but emojis and tags was left.
 */
export function toMercadoLivrePlainText(description: string): string {
  const withoutTags = description
    .replaceAll(/\r\n?/gu, "\n")
    .replaceAll(LINE_BREAK_TAG, "\n")
    .replaceAll(HTML_TAG, "");
  return removeEmojis(withoutTags).trim();
}
