import { recordBlockedContact } from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { z } from "zod";
import { database } from "@/lib/server/database";
import { firstIssue } from "@/features/support/support.server";
import { conversationContactRefusals } from "./conversation-contact";

/** Who typed the refused text: the audit keeps who and where, never the text. */
export interface ConversationAuthor {
  side: "reseller" | "supplier";
  tenantId: string;
  userId: string;
  impersonatedBy: string | null;
}

async function auditRefusals(
  error: z.ZodError,
  input: Readonly<Record<string, unknown>>,
  author: ConversationAuthor,
): Promise<void> {
  const channel = author.side === "reseller" ? "seller_app" : "supplier_panel";
  for (const { field, kinds } of conversationContactRefusals(error, input)) {
    logger.warn("contact_details.blocked", {
      channel,
      tenantId: author.tenantId,
      userId: author.userId,
      field: `conversation.${field}`,
      kinds,
    });
    try {
      await recordBlockedContact(database, {
        channel,
        field: `conversation.${field}`,
        kinds,
        tenantId: author.tenantId,
        userId: author.userId,
        impersonatedBy: author.impersonatedBy,
        supplierToken: null,
      });
    } catch (auditError) {
      logger.error("contact_details.audit_failed", { channel, field, error: auditError });
    }
  }
}

/**
 * Checks a conversation form. A contact in the text is refused (400) and audited like the
 * order messages; any other problem answers 400 with its own message.
 */
export async function parseConversationForm<Output>(
  schema: z.ZodType<Output>,
  input: Readonly<Record<string, unknown>>,
  author: ConversationAuthor,
): Promise<Output> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  await auditRefusals(parsed.error, input, author);
  throw validationError(firstIssue(parsed.error));
}
