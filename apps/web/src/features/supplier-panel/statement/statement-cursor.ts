import { z } from "zod";

/**
 * The statement's page cursor travels in the URL of the next request as "<paidAt ISO>_<id>":
 * the last line of the page before, so the next page starts right after it.
 */
const SEPARATOR = "_";
const cursorPartsSchema = z.object({ paidAt: z.iso.datetime(), id: z.uuid() });

export const STATEMENT_CURSOR_MAX_LENGTH = 80;

export function encodeStatementCursor(line: { paidAt: Date; id: string }): string {
  return `${line.paidAt.toISOString()}${SEPARATOR}${line.id}`;
}

/** The cursor's payment, or null when the text is not one this page wrote. */
export function decodeStatementCursor(cursor: string): { paidAt: Date; id: string } | null {
  const separatorAt = cursor.indexOf(SEPARATOR);
  if (separatorAt === -1) {
    return null;
  }
  const parsed = cursorPartsSchema.safeParse({
    paidAt: cursor.slice(0, separatorAt),
    id: cursor.slice(separatorAt + 1),
  });
  if (!parsed.success) {
    return null;
  }
  return { paidAt: new Date(parsed.data.paidAt), id: parsed.data.id };
}
