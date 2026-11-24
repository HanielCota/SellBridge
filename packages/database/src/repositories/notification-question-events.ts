import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { buyerQuestions, listings, listingTargets } from "../schema/index.ts";

/** A buyer's question still waiting for the reseller's answer; it stays until answered. */
export interface BuyerQuestionEvent {
  kind: "buyer_question";
  /** The question. */
  entityId: string;
  at: Date;
  listingTitle: string;
  text: string;
}

/** Bell entries for the tenant's questions still to answer, newest first. */
export async function buyerQuestionEvents(
  database: Database,
  tenantId: string,
  limit: number,
): Promise<BuyerQuestionEvent[]> {
  const rows = await database
    .select({
      entityId: buyerQuestions.id,
      at: buyerQuestions.askedAt,
      listingTitle: listings.title,
      text: buyerQuestions.text,
    })
    .from(buyerQuestions)
    .innerJoin(listingTargets, eq(listingTargets.id, buyerQuestions.listingTargetId))
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(and(eq(buyerQuestions.tenantId, tenantId), eq(buyerQuestions.status, "unanswered")))
    .orderBy(desc(buyerQuestions.askedAt), desc(buyerQuestions.id))
    .limit(limit);
  return rows.map((row) => ({ kind: "buyer_question" as const, ...row }));
}
