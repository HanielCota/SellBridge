import {
  CONTACT_REFUSAL_MESSAGES,
  findContactDetails,
  type ContactKind,
} from "@sellbridge/shared/schemas";
import type { z } from "zod";

/** One field refused for carrying a contact, with what kind of contact: never the text. */
export interface ConversationContactRefusal {
  field: string;
  kinds: ContactKind[];
}

function textAt(input: Readonly<Record<string, unknown>>, field: string): string {
  const value = input[field];
  return typeof value === "string" ? value : "";
}

/**
 * The fields of a conversation message the schema refused for carrying a phone, e-mail, chat
 * link or social handle. Empty when the message was refused for anything else (too short).
 */
export function conversationContactRefusals(
  error: z.ZodError,
  input: Readonly<Record<string, unknown>>,
): ConversationContactRefusal[] {
  return error.issues
    .filter((issue) => CONTACT_REFUSAL_MESSAGES.includes(issue.message))
    .map((issue) => {
      const field = issue.path.map(String).join(".");
      const kinds = findContactDetails(textAt(input, field));
      return { field, kinds: kinds.length > 0 ? kinds : ["link"] };
    });
}
