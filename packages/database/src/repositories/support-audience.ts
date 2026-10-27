import { eq } from "drizzle-orm";
import { tickets } from "../schema/index.ts";

/**
 * Tickets the SellBridge team answers. Every team queue, counter and metric, and the reseller's
 * own "Seus chamados", keeps to these; the reseller ↔ supplier conversations live apart.
 */
export const platformTicketSql = eq(tickets.audience, "platform");

/** Conversations between a reseller and the supplier of their store. */
export const supplierConversationSql = eq(tickets.audience, "supplier");
