import { queryOptions } from "@tanstack/react-query";
import {
  getPaymentAccountFn,
  getPaymentFeeFn,
  getResellerSupplierPaymentFn,
} from "./supplier-payments.functions";

export const paymentAccountQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-payment-account", supplierId],
    queryFn: () => getPaymentAccountFn({ data: { supplierId } }),
  });

export const resellerSupplierPaymentQueryOptions = (shipmentId: string) =>
  queryOptions({
    queryKey: ["reseller-supplier-payment", shipmentId],
    queryFn: () => getResellerSupplierPaymentFn({ data: { shipmentId } }),
  });

export const paymentFeeQueryOptions = () =>
  queryOptions({ queryKey: ["platform-payment-fee"], queryFn: () => getPaymentFeeFn() });
