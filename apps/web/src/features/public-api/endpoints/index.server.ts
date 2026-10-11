import type { ApiOperation } from "../endpoint";
import { getCatalogProduct, listCatalogProducts } from "./catalog.server";
import { listEvents } from "./events.server";
import { getFinancialSummary } from "./financials.server";
import { getListing, listListings } from "./listings-read.server";
import { createListing, updateListing } from "./listings-write.server";
import { getMe } from "./me.server";
import { getOrder, listOrders } from "./orders.server";
import { listStores } from "./stores.server";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
} from "./webhooks.server";

/**
 * Every public operation, in the order an integration meets them: account, stores, catalog,
 * listings, sales, then events and webhooks. A new endpoint must be added here to be documented.
 */
export const API_OPERATIONS: readonly ApiOperation[] = [
  getMe,
  listStores,
  listCatalogProducts,
  getCatalogProduct,
  listListings,
  getListing,
  createListing,
  updateListing,
  listOrders,
  getOrder,
  getFinancialSummary,
  listEvents,
  listWebhookEndpoints,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
];
