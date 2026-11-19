import type { SupplierApprovalQueueSearch } from "@sellbridge/shared/supplier-approval";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  adminCountSupplierApprovalQueue,
  adminGetSupplierApproval,
  adminListSupplierApprovalQueue,
  getRequireReceivingAccountFn,
} from "./approval.functions";

/** Every approval query starts with this key, so one invalidation after a decision refreshes all. */
export const supplierApprovalKey = ["supplier-approval"] as const;

export const supplierApprovalQueueQueryOptions = (search: SupplierApprovalQueueSearch) =>
  queryOptions({
    queryKey: [...supplierApprovalKey, "queue", search],
    queryFn: () => adminListSupplierApprovalQueue({ data: search }),
    placeholderData: keepPreviousData,
  });

export const supplierApprovalCountQueryOptions = () =>
  queryOptions({
    queryKey: [...supplierApprovalKey, "count"],
    queryFn: () => adminCountSupplierApprovalQueue(),
  });

export const supplierApprovalStateQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: [...supplierApprovalKey, "state", supplierId],
    queryFn: () => adminGetSupplierApproval({ data: { supplierId } }),
  });

export const requireReceivingAccountQueryOptions = () =>
  queryOptions({
    queryKey: [...supplierApprovalKey, "require-receiving-account"],
    queryFn: () => getRequireReceivingAccountFn(),
  });
