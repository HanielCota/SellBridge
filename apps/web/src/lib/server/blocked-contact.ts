import {
  CONTACT_DETAILS_REFUSED,
  type ContactKind,
  findContactDetails,
} from "@sellbridge/shared/schemas";
import { z } from "zod";

/** One field refused for carrying a contact, with what kind of contact: never the text. */
export interface BlockedContactField {
  field: string;
  kinds: ContactKind[];
}

const pathSegmentSchema = z.union([
  z.string(),
  z.number(),
  z.object({ key: z.union([z.string(), z.number()]) }).transform((segment) => segment.key),
]);

/** The Standard Schema issues TanStack Start puts, as JSON, in the message of a refused input. */
const inputIssuesSchema = z.array(
  z.object({ message: z.string(), path: z.array(pathSegmentSchema).default([]) }),
);

function inputIssuesOf(error: unknown): z.infer<typeof inputIssuesSchema> {
  if (!(error instanceof Error) || !error.message.startsWith("[")) {
    return [];
  }
  try {
    const parsed = inputIssuesSchema.safeParse(JSON.parse(error.message));
    return parsed.success ? parsed.data : [];
  } catch {
    // Not an issue list after all: some other error that happens to start with "[".
    return [];
  }
}

const recordSchema = z.record(z.string(), z.unknown());

function valueAt(input: unknown, path: ReadonlyArray<string | number>): unknown {
  return path.reduce<unknown>((current, key) => {
    const record = recordSchema.safeParse(current);
    return record.success ? record.data[String(key)] : undefined;
  }, input);
}

/** A refused link field may hold no phone or e-mail at all: the host alone is the contact. */
function kindsIn(value: unknown): ContactKind[] {
  const kinds = typeof value === "string" ? findContactDetails(value) : [];
  return kinds.length > 0 ? kinds : ["link"];
}

/**
 * The fields a server function refused for carrying a contact, read from the validation error
 * and the raw input. Empty for any other error.
 */
export function blockedContactFields(error: unknown, input: unknown): BlockedContactField[] {
  return inputIssuesOf(error)
    .filter((issue) => issue.message === CONTACT_DETAILS_REFUSED)
    .map((issue) => ({
      field: issue.path.join("."),
      kinds: kindsIn(valueAt(input, issue.path)),
    }));
}
