const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Serializes a value with every UUID replaced by a fixed marker, so a test can search the text
 * for a leaked number: a random id holds any run of digits, and "3990" inside one is not a price.
 */
export function serializeWithoutIds(value: unknown): string {
  return JSON.stringify(value).replaceAll(UUID_IN_TEXT, "<id>");
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
