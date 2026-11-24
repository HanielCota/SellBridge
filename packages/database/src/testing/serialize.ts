const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** How `JSON.stringify` writes a `Date`: "2026-11-24T03:21:39.912Z". */
const ISO_TIMESTAMP_IN_TEXT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/**
 * Serializes a value with every UUID and timestamp replaced by a fixed marker, so a test can
 * search the text for a leaked number: a random id holds any run of digits ("3990" inside one is
 * not a price), and a time such as ":39.912Z" holds "39.9".
 */
export function serializeWithoutIdsOrTimes(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll(UUID_IN_TEXT, "<id>")
    .replaceAll(ISO_TIMESTAMP_IN_TEXT, "<time>");
}

/** Lists every object key at any depth, so a test can assert a field name never reaches a row. */
export function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectKeys(entry));
  }
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => [key, ...collectKeys(entry)]);
}
