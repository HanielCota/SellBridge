import {
  getCatalogProduct,
  listCatalogProducts,
} from "@/features/public-api/endpoints/catalog.server";
import { getFinancialSummary } from "@/features/public-api/endpoints/financials.server";
import { getListing, listListings } from "@/features/public-api/endpoints/listings-read.server";
import { listOrders } from "@/features/public-api/endpoints/orders.server";
import { listStores } from "@/features/public-api/endpoints/stores.server";
import { forOrganization } from "../organization-endpoint.server";

export const listDeveloperStores = forOrganization(listStores, "stores:read");
export const listDeveloperListings = forOrganization(listListings, "listings:read");
export const getDeveloperListing = forOrganization(getListing, "listings:read");
export const listDeveloperOrders = forOrganization(listOrders, "orders:read");
export const getDeveloperFinancialSummary = forOrganization(getFinancialSummary, "financials:read");
export const listDeveloperCatalogProducts = forOrganization(listCatalogProducts, "catalog:read");
export const getDeveloperCatalogProduct = forOrganization(getCatalogProduct, "catalog:read");
