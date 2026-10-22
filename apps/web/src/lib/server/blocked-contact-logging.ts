import {
  type BlockedContactChannel,
  recordBlockedContact,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { blockedContactFields } from "./blocked-contact.ts";
import { database } from "./database.ts";

/** What the session middleware before this one put in the context, when there is a session. */
const signedInSchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  impersonatedBy: z.string().nullable().optional(),
});

const supplierLinkInputSchema = z.object({ token: z.string() });

interface RefusedCall {
  channel: BlockedContactChannel;
  error: unknown;
  input: unknown;
  context: unknown;
}

/**
 * Logs and audits each field the schema refused for carrying a contact: who, where and what
 * kind, never the text. A failure to audit is logged and never hides the refusal itself.
 */
async function recordRefusedContacts(call: RefusedCall): Promise<void> {
  const fields = blockedContactFields(call.error, call.input);
  if (fields.length === 0) {
    return;
  }
  const signedIn = signedInSchema.safeParse(call.context);
  const tenantId = signedIn.success ? (signedIn.data.tenantId ?? null) : null;
  const userId = signedIn.success ? (signedIn.data.userId ?? null) : null;
  const impersonatedBy = signedIn.success ? (signedIn.data.impersonatedBy ?? null) : null;
  const link = supplierLinkInputSchema.safeParse(call.input);
  const supplierToken = link.success ? link.data.token : null;
  for (const { field, kinds } of fields) {
    logger.warn("contact_details.blocked", {
      channel: call.channel,
      tenantId,
      userId,
      field,
      kinds,
    });
    try {
      await recordBlockedContact(database, {
        channel: call.channel,
        field,
        kinds,
        tenantId,
        userId,
        impersonatedBy,
        supplierToken,
      });
    } catch (error) {
      logger.error("contact_details.audit_failed", { channel: call.channel, field, error });
    }
  }
}

/**
 * Goes after the session middleware of a function whose input carries free text between reseller
 * and supplier: the schema refuses the contact (`refuseContactDetails`), this records the try.
 */
export function blockedContactLogging(channel: BlockedContactChannel) {
  return createMiddleware({ type: "function" }).server(async ({ next, data, context }) => {
    try {
      return await next();
    } catch (error) {
      await recordRefusedContacts({ channel, error, input: data, context });
      throw error;
    }
  });
}
