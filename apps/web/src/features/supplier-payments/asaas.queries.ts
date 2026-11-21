import { queryOptions } from "@tanstack/react-query";
import {
  getAsaasReceivingFn,
  getHeldPaymentDecisionFn,
  getManualRefundFn,
  getNewSupplierRuleFn,
} from "./asaas.functions";

export const asaasReceivingQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-asaas-receiving", supplierId],
    queryFn: () => getAsaasReceivingFn({ data: { supplierId } }),
  });

export const heldPaymentDecisionQueryOptions = (shipmentPaymentId: string) =>
  queryOptions({
    queryKey: ["held-payment-decision", shipmentPaymentId],
    queryFn: () => getHeldPaymentDecisionFn({ data: { shipmentPaymentId } }),
  });

export const manualRefundQueryOptions = (shipmentPaymentId: string) =>
  queryOptions({
    queryKey: ["manual-refund", shipmentPaymentId],
    queryFn: () => getManualRefundFn({ data: { shipmentPaymentId } }),
  });

export const newSupplierRuleQueryOptions = () =>
  queryOptions({ queryKey: ["new-supplier-rule"], queryFn: () => getNewSupplierRuleFn() });
