import { queryOptions } from "@tanstack/react-query";
import { listOrderClaimsFn, listSupplierParcelClaimsFn } from "./claims.functions";

export const orderClaimsQueryOptions = (orderId: string) =>
  queryOptions({
    queryKey: ["order-claims", orderId],
    queryFn: () => listOrderClaimsFn({ data: { orderId } }),
  });

export const supplierParcelClaimsQueryOptions = (supplierId: string, shipmentId: string) =>
  queryOptions({
    queryKey: ["supplier-parcel-claims", supplierId, shipmentId],
    queryFn: () => listSupplierParcelClaimsFn({ data: { supplierId, shipmentId } }),
  });
