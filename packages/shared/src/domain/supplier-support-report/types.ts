import type { SupplierConversationTopicId } from "../supplier-conversation-topics.ts";
import type { TicketStatus } from "../ticket-rules.ts";

export const SUPPLIER_REPORT_DAYS = [7, 30, 90] as const;
export type SupplierReportDays = (typeof SUPPLIER_REPORT_DAYS)[number];

/** One conversation sent to the supplier, as the report reads it. */
export interface ReportConversationRow {
  id: string;
  topic: SupplierConversationTopicId;
  createdAt: Date;
  /** The supplier's first answer; null while it never answered. */
  firstResponseAt: Date | null;
  status: TicketStatus;
  /** Since when the store waits for the supplier; null when the supplier owes nothing. */
  awaitingSince: Date | null;
  /** The latest time the conversation was finished; null while it never was. */
  closedAt: Date | null;
}

/** Who finished a conversation: the supplier, the store, or nobody (7 days without the store). */
export type ClosedBy = "supplier" | "store" | "automatic";

export interface ReportCloseRow {
  ticketId: string;
  topic: SupplierConversationTopicId;
  closedAt: Date;
  closedBy: ClosedBy;
}

/** The store writing on a finished conversation, which opens it again. */
export interface ReportReopenRow {
  ticketId: string;
  reopenedAt: Date;
}

export interface SupplierSupportRows {
  /** Conversations opened since the start of the previous period, plus every one still open. */
  conversations: readonly ReportConversationRow[];
  /** Finishes since the start of the period. */
  closes: readonly ReportCloseRow[];
  /** Reopenings since the start of the period. */
  reopens: readonly ReportReopenRow[];
}

/** "18 de 20": how many passed, out of how many counted. */
export interface Share {
  count: number;
  of: number;
}

export interface SubjectRow {
  topic: SupplierConversationTopicId;
  received: number;
  /** Median minutes to the first answer; null when none was answered. */
  firstResponseMinutes: number | null;
  cameBack: Share;
}

export interface SupplierSupportReport {
  days: SupplierReportDays;
  /** Conversations waiting for the supplier right now, whatever the period. */
  waiting: {
    count: number;
    /** Past the one-business-day deadline. */
    late: number;
    oldestSince: Date | null;
  };
  received: { current: number; previous: number };
  firstResponseMinutes: number | null;
  /** First answers within one business day, out of the conversations whose answer was due. */
  answeredOnTime: Share;
  finished: Record<ClosedBy, number> & { total: number };
  /** Finished conversations the store wrote on again within the come-back window. */
  cameBack: Share;
  /** One row per topic with activity in the period, the busiest first. */
  subjects: readonly SubjectRow[];
}
