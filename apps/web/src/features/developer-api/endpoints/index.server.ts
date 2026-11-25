import type { DeveloperScope } from "@sellbridge/shared/developer-api";
import { noInput as noBody } from "@/features/public-api/endpoint";
import type { DocumentedOperation } from "@/features/public-api/openapi";
import { getDeveloperMe } from "./me.server";
import { getDeveloperOrder } from "./orders.server";
import {
  getDeveloperCatalogProduct,
  getDeveloperFinancialSummary,
  getDeveloperListing,
  listDeveloperCatalogProducts,
  listDeveloperListings,
  listDeveloperOrders,
  listDeveloperStores,
} from "./organization-reads.server";
import { getDeveloperOrganization, listDeveloperOrganizations } from "./organizations.server";
import { listDeveloperSupplierProducts, listDeveloperSuppliers } from "./suppliers.server";
import { getDeveloperTicket, listDeveloperTickets } from "./tickets.server";

/**
 * Every developer operation, in the order another project meets them. A new endpoint must be
 * added here to appear in the manual.
 */
export const DEVELOPER_ENDPOINTS = [
  getDeveloperMe,
  listDeveloperSuppliers,
  listDeveloperSupplierProducts,
  listDeveloperOrganizations,
  getDeveloperOrganization,
  listDeveloperStores,
  listDeveloperCatalogProducts,
  getDeveloperCatalogProduct,
  listDeveloperListings,
  getDeveloperListing,
  listDeveloperOrders,
  getDeveloperOrder,
  getDeveloperFinancialSummary,
  listDeveloperTickets,
  getDeveloperTicket,
];

/** The endpoints as the manual describes them: every developer read is a GET without a body. */
export const DEVELOPER_OPERATIONS: readonly DocumentedOperation<DeveloperScope>[] =
  DEVELOPER_ENDPOINTS.map((endpoint) => ({
    method: "GET",
    path: endpoint.path,
    operationId: endpoint.operationId,
    tag: endpoint.tag,
    summary: endpoint.summary,
    ...(endpoint.description === undefined ? {} : { description: endpoint.description }),
    scope: endpoint.scope,
    params: endpoint.params,
    query: endpoint.query,
    body: noBody,
    response: endpoint.response,
  }));
