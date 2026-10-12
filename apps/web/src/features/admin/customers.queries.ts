import type { CustomerIssuesSearch, CustomersSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  adminCustomerJourney,
  adminGetCustomer,
  adminListCustomerIssues,
  adminListCustomers,
} from "./customers.functions";

/** The list's own params; the tab in `view` does not change what it fetches. */
function listParams(search: CustomersSearch) {
  return {
    query: search.query,
    issue: search.issue,
    sort: search.sort,
    page: search.page,
    pageSize: search.pageSize,
  };
}

export const customersQueryOptions = (search: CustomersSearch) =>
  queryOptions({
    queryKey: ["customers", "list", listParams(search)],
    queryFn: () => adminListCustomers({ data: search }),
    placeholderData: keepPreviousData,
  });

export const customerIssuesQueryOptions = (search: CustomerIssuesSearch) =>
  queryOptions({
    queryKey: ["customers", "issues", search],
    queryFn: () => adminListCustomerIssues({ data: search }),
    placeholderData: keepPreviousData,
  });

export const customerJourneyQueryOptions = (query: string | undefined) =>
  queryOptions({
    queryKey: ["customers", "journey", query ?? null],
    queryFn: () => adminCustomerJourney({ data: { query } }),
    placeholderData: keepPreviousData,
  });

export const customerQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ["customers", "detail", userId],
    queryFn: () => adminGetCustomer({ data: { userId } }),
  });
