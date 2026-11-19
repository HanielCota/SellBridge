import {
  findBillingHolder,
  findPayableShipment,
  type PayableShipment,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import {
  AsaasAccountUnavailableError,
  closeAsaasChargesBeforeSwitch,
  isAsaasError,
  openAsaasCharge,
  reconcileAsaasParcel,
  type AsaasPayer,
} from "@sellbridge/payments/asaas";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { SupplierPayMethod } from "@sellbridge/shared/shipment-payments";
import { database } from "@/lib/server/database";
import { asaasContext } from "./asaas.server";

const UNCHECKED_MESSAGE =
  "Não conseguimos conferir com o Asaas agora. Tente de novo em alguns minutos.";
const ACCOUNT_MESSAGE =
  "A conta de recebimento deste fornecedor está com problema no Asaas. Assim que ele resolver, o pagamento aparece aqui.";
const ALREADY_PAID_MESSAGE = "Este envio já foi pago. O valor está protegido no Asaas.";

/** Who pays, as Asaas registers it: the reseller's company when it has one, else the person. */
async function payerOf(tenantId: string): Promise<AsaasPayer> {
  const holder = await findBillingHolder(database, tenantId);
  if (holder === null) {
    throw validationError(
      "Complete seus dados de cobrança (nome e CPF) em Configurações para pagar o fornecedor.",
    );
  }
  if (holder.company !== null) {
    return { tenantId, name: holder.company.companyName, cpfCnpj: holder.company.cnpj };
  }
  return { tenantId, name: holder.fullName, cpfCnpj: holder.cpf };
}

function friendly(error: unknown): Error {
  if (error instanceof AsaasAccountUnavailableError) {
    return validationError(ACCOUNT_MESSAGE);
  }
  if (isAsaasError(error)) {
    // The error itself logs only its message: Asaas's reason lives in its own fields.
    logger.warn("asaas.checkout_failed", {
      error,
      status: error.status,
      codes: error.codes,
      issues: error.issues,
    });
    return validationError(UNCHECKED_MESSAGE);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/**
 * Opens (or reuses) the Asaas charge of a parcel just reserved, asking only the method the reseller
 * picked; the reseller pays on Asaas's page and comes back to the order.
 *
 * @throws When the reseller's billing data is missing, the supplier account is unusable, Asaas
 * cannot be reached, or a paid charge already exists.
 */
export async function openAsaasCheckout(input: {
  tenantId: string;
  payable: PayableShipment;
  account: SupplierPaymentAccount;
  payment: ShipmentPayment;
  payMethod: SupplierPayMethod;
  successUrl: string;
}): Promise<{ checkoutUrl: string }> {
  const context = asaasContext();
  if (context === null) {
    throw validationError("O pagamento protegido pelo Asaas ainda não está disponível.");
  }
  const payer = await payerOf(input.tenantId);
  try {
    const opening = await openAsaasCharge(context, {
      account: input.account,
      payment: input.payment,
      payer,
      payMethod: input.payMethod,
      description: `Pedido ${input.payable.externalOrderId} · ${input.payable.supplierName}`,
      successUrl: input.successUrl,
      now: new Date(),
    });
    if (opening.kind === "already_paid") {
      throw validationError(ALREADY_PAID_MESSAGE);
    }
    return { checkoutUrl: opening.checkoutUrl };
  } catch (error) {
    throw friendly(error);
  }
}

/**
 * Before a parcel that started on Asaas is charged through Mercado Pago: a paid Asaas charge
 * blocks it, unpaid ones are removed. Asaas unreachable refuses, so nothing is paid twice.
 */
export async function leaveAsaasCharges(input: {
  account: SupplierPaymentAccount | null;
  payment: ShipmentPayment;
}): Promise<void> {
  const context = asaasContext();
  if (context === null || input.account === null) {
    throw validationError(UNCHECKED_MESSAGE);
  }
  try {
    const outcome = await closeAsaasChargesBeforeSwitch(context, {
      account: input.account,
      payment: input.payment,
    });
    if (outcome === "paid") {
      throw validationError(ALREADY_PAID_MESSAGE);
    }
  } catch (error) {
    throw friendly(error);
  }
}

/**
 * The reseller is back from Asaas's page: the parcel's charges are read back right away, so the
 * badge does not wait for the notice.
 */
export async function refreshAsaasParcel(input: {
  tenantId: string;
  shipmentId: string;
  account: SupplierPaymentAccount | null;
}): Promise<void> {
  const context = asaasContext();
  const payable = await findPayableShipment(database, input);
  const payment = payable?.payment ?? null;
  if (context === null || input.account === null || payment?.provider !== "asaas") {
    return;
  }
  try {
    await reconcileAsaasParcel(context, { account: input.account, payment });
  } catch (error) {
    logger.warn("asaas.return_unchecked", { shipmentPaymentId: payment.id, error });
  }
}
