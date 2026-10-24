import { supplierConversationContent } from "@sellbridge/shared/notification-events";
import { and, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { storeConnections, suppliers, tickets } from "../schema/index.ts";
import { clipText, notifyWorkspace } from "./notification-producers.ts";
import { supplierConversationSql } from "./support-audience.ts";

const TITLE_LENGTH = 80;

/**
 * Tells the other side of a reseller ↔ supplier conversation that a message arrived (e-mail and
 * push by each person's choice; the bell reads the unread messages itself). The text never goes
 * in the notice. Keyed by the message time, so a retry never queues it twice.
 */
export async function queueSupplierConversationNotice(
  database: Database,
  input: { ticketId: string; recipient: "reseller" | "supplier"; at: Date },
): Promise<number> {
  const [conversation] = await database
    .select({
      tenantId: tickets.tenantId,
      subject: tickets.subject,
      storeName: storeConnections.shopName,
      supplierOrganizationId: suppliers.organizationId,
    })
    .from(tickets)
    .leftJoin(storeConnections, eq(storeConnections.id, tickets.storeConnectionId))
    .leftJoin(suppliers, eq(suppliers.id, tickets.supplierId))
    .where(and(eq(tickets.id, input.ticketId), supplierConversationSql));
  if (conversation === undefined) {
    return 0;
  }
  const tenantId =
    input.recipient === "supplier" ? conversation.supplierOrganizationId : conversation.tenantId;
  if (tenantId === null) {
    return 0;
  }
  return notifyWorkspace(database, {
    tenantId,
    event: "supplier_conversation",
    dedupeKey: `supplier_conversation:${input.ticketId}:${input.recipient}:${input.at.toISOString()}`,
    content: supplierConversationContent({
      ticketId: input.ticketId,
      subject: clipText(conversation.subject, TITLE_LENGTH),
      recipient: input.recipient,
      storeName: clipText(conversation.storeName ?? "sem nome", TITLE_LENGTH),
    }),
  });
}
