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
