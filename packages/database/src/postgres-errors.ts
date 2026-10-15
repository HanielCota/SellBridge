const UNIQUE_VIOLATION = "23505";

function fieldOf(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null || !(field in value)) {
    return undefined;
  }
  return Reflect.get(value, field);
}

/**
 * Whether `error` is Postgres refusing a row because of the unique index `indexName`. Drizzle
 * wraps the driver's error in `cause`; the driver's error itself is accepted too.
 */
export function isUniqueViolation(error: unknown, indexName: string): boolean {
  const cause = fieldOf(error, "cause");
  const driverError = cause === undefined ? error : cause;
  return (
    fieldOf(driverError, "code") === UNIQUE_VIOLATION &&
    fieldOf(driverError, "constraint_name") === indexName
  );
}
