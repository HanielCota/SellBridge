import { pgEnum } from "drizzle-orm/pg-core";

export const marketplaceEnum = pgEnum("marketplace", [
  "mock",
  "mercado_livre",
  "shopee",
  "tiktok_shop",
]);

export const storeConnectionStatusEnum = pgEnum("store_connection_status", [
  "connected",
  "expired",
  "error",
  "disconnected",
]);

export const listingTargetStatusEnum = pgEnum("listing_target_status", [
  "pending",
  "publishing",
  "published",
  "error",
  // Published but held at zero stock on the marketplace until the reseller resumes it.
  "paused",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
]);

export const orderAdjustmentTypeEnum = pgEnum("order_adjustment_type", [
  "refund",
  "return",
  "commission",
]);

export const ticketStatusEnum = pgEnum("ticket_status", ["open", "answered", "closed"]);

/** Kept in step with `TICKET_CATEGORIES` in the shared ticket rules. */
export const ticketCategoryEnum = pgEnum("ticket_category", [
  "order",
  "payment",
  "store",
  "listing",
  "account",
  "other",
]);

/** Kept in step with `TICKET_PRIORITIES`; declared from the least to the most urgent. */
export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);

/** What changed on a ticket, for its history. Messages live in `ticket_messages`. */
export const ticketEventTypeEnum = pgEnum("ticket_event_type", [
  "status_changed",
  "assigned",
  "priority_changed",
  "category_changed",
  "rated",
  "order_linked",
  "order_unlinked",
  "follower_added",
]);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "succeeded",
  "failed",
]);

/** Kept in step with `CUSTOMER_ISSUE_KINDS` in the shared admin schemas. */
export const customerIssueKindEnum = pgEnum("customer_issue_kind", [
  "store",
  "listings",
  "ticket",
  "onboarding",
  "cooling",
]);
