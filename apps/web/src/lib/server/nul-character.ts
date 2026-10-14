/**
 * Postgres `text` and `jsonb` refuse the NUL character (U+0000). These helpers work on parsed
 * values through `JSON.parse`'s reviver, never on the JSON text: in the text, `\\u0000` (an
 * escaped backslash followed by "u0000") is legitimate and must not be touched.
 */
const NUL = String.fromCharCode(0);

/** Parses JSON and says whether any key or string value holds a NUL. */
export function parseJsonFindingNul(text: string): { value: unknown; hasNul: boolean } {
  let hasNul = false;
  const value: unknown = JSON.parse(text, (key, item: unknown) => {
    if (key.includes(NUL) || (typeof item === "string" && item.includes(NUL))) hasNul = true;
    return item;
  });
  return { value, hasNul };
}

/** A copy of a JSON-safe value without NUL: removed from strings, keys holding it dropped. */
export function withoutNul(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null), (key, item: unknown) => {
    if (key.includes(NUL)) return undefined;
    return typeof item === "string" ? item.replaceAll(NUL, "") : item;
  });
}
