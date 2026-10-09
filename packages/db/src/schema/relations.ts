import { relations } from "drizzle-orm";
import { listings, listingTargets } from "./listings.ts";
import { orderAdjustments, orderItems, orders } from "./orders.ts";
import { storeConnections } from "./stores.ts";
import { categories, supplierCoverage, supplierProducts, suppliers } from "./suppliers.ts";
import { ticketAttachments, ticketMessages, tickets } from "./support.ts";

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  coverage: many(supplierCoverage),
  products: many(supplierProducts),
}));

export const supplierCoverageRelations = relations(supplierCoverage, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierCoverage.supplierId], references: [suppliers.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(supplierProducts),
}));

export const supplierProductsRelations = relations(supplierProducts, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierProducts.supplierId], references: [suppliers.id] }),
  category: one(categories, {
    fields: [supplierProducts.categoryId],
    references: [categories.id],
  }),
}));

export const storeConnectionsRelations = relations(storeConnections, ({ many }) => ({
  listingTargets: many(listingTargets),
  orders: many(orders),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  product: one(supplierProducts, {
    fields: [listings.supplierProductId],
    references: [supplierProducts.id],
  }),
  targets: many(listingTargets),
}));

export const listingTargetsRelations = relations(listingTargets, ({ one }) => ({
  listing: one(listings, { fields: [listingTargets.listingId], references: [listings.id] }),
  store: one(storeConnections, {
    fields: [listingTargets.storeConnectionId],
    references: [storeConnections.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  store: one(storeConnections, {
    fields: [orders.storeConnectionId],
    references: [storeConnections.id],
  }),
  items: many(orderItems),
  adjustments: many(orderAdjustments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

export const orderAdjustmentsRelations = relations(orderAdjustments, ({ one }) => ({
  order: one(orders, { fields: [orderAdjustments.orderId], references: [orders.id] }),
}));

export const ticketsRelations = relations(tickets, ({ many }) => ({
  messages: many(ticketMessages),
  attachments: many(ticketAttachments),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one, many }) => ({
  ticket: one(tickets, { fields: [ticketMessages.ticketId], references: [tickets.id] }),
  attachments: many(ticketAttachments),
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketAttachments.ticketId], references: [tickets.id] }),
  message: one(ticketMessages, {
    fields: [ticketAttachments.messageId],
    references: [ticketMessages.id],
  }),
}));
