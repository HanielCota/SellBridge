import type { CustomersSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { adminGetCustomer, adminListCustomers } from "./customers.functions";

export const customersQueryOptions = (search: CustomersSearch) =>
  queryOptions({
    queryKey: ["customers", search],
    queryFn: () => adminListCustomers({ data: search }),
    placeholderData: keepPreviousData,
  });

export const customerQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ["customers", "detail", userId],
    queryFn: () => adminGetCustomer({ data: { userId } }),
  });
