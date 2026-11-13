import type { ProblemPage } from "@sellbridge/database/repositories";

type ProblemCursor = NonNullable<ProblemPage["nextCursor"]>;

/** The list's page cursor as one URL-safe string: "<last seen ISO time>_<id>". */
export function encodeProblemCursor(cursor: ProblemCursor | null): string | null {
  if (cursor === null) {
    return null;
  }
  return `${cursor.lastSeenAt.toISOString()}_${cursor.id}`;
}

/** Undefined when there is no cursor; throws on one that does not read as a date and an id. */
export function decodeProblemCursor(value: string | undefined): ProblemCursor | undefined {
  if (value === undefined) {
    return undefined;
  }
  const separator = value.lastIndexOf("_");
  const lastSeenAt = new Date(value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (separator <= 0 || Number.isNaN(lastSeenAt.getTime()) || id === "") {
    throw new RangeError(`Invalid problem cursor: ${value.slice(0, 80)}`);
  }
  return { lastSeenAt, id };
}
