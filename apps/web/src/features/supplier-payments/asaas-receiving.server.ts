import { getReceivingRules, saveSupplierPaymentChoice } from "@sellbridge/database/repositories";
import {
  AsaasAccountKeyMissingError,
  isAsaasError,
  openAsaasAccount,
  PROTECTION_MISSING,
  protectAsaasAccount,
  refreshAsaasReview,
  type AsaasContext,
  type AsaasNewAccount,
} from "@sellbridge/payments/asaas";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  mustReceiveProtected,
  type PaymentProviderName,
} from "@sellbridge/shared/payment-accounts";
import { database } from "@/lib/server/database";
import type { AsaasAccountForm } from "./asaas-account-form";
import {
  asaasContext,
  asaasNoticeEmail,
  asaasWebhookUrl,
  isAsaasUsable,
  isMercadoPagoUsable,
  receivingAccountsOf,
  type ReceivingAccounts,
} from "./asaas.server";
import { paymentAccountOwnerRefusal, type PaymentAccountActor } from "./mercado-pago-connection";

const UNAVAILABLE = "O recebimento com proteção pelo Asaas ainda não está disponível.";
const ASAAS_DOWN = "Não conseguimos falar com o Asaas agora. Tente de novo em alguns minutos.";

function requireOwner(actor: PaymentAccountActor): void {
  const refusal = paymentAccountOwnerRefusal(actor);
  if (refusal !== null) {
    throw validationError(refusal.replaceAll("conta Mercado Pago", "conta de recebimento"));
  }
}

function requireContext(): AsaasContext {
  const context = asaasContext();
  if (context === null) {
    throw validationError(UNAVAILABLE);
  }
  return context;
}

/** Where Asaas's review stands, read again while it is not approved; Asaas down keeps the last. */
async function currentReview(context: AsaasContext | null, accounts: ReceivingAccounts) {
  const { asaas } = accounts;
  if (context === null || asaas?.status !== "connected") {
    return { reviewStatus: asaas?.reviewStatus ?? null, documentsUrl: null };
  }
  if (asaas.reviewStatus === "approved") {
    return { reviewStatus: asaas.reviewStatus, documentsUrl: null };
  }
  try {
    return await refreshAsaasReview(context, asaas);
  } catch (error) {
    logger.warn("asaas.review_unread", { supplierId: asaas.supplierId, error });
    return { reviewStatus: asaas.reviewStatus, documentsUrl: null };
  }
}

/** What the supplier's Recebimentos page shows about Asaas and about which account receives. */
export async function loadAsaasReceiving(supplierId: string) {
  const context = asaasContext();
  const [accounts, rules] = await Promise.all([
    receivingAccountsOf(supplierId),
    getReceivingRules(database),
  ]);
  const review = await currentReview(context, accounts);
  const { asaas, rule, confirmedDeliveries, receiving, choice } = accounts;
  return {
    available: context !== null,
    /** The admin requires an approved account to sell: without it, the products are hidden. */
    accountRequired: rules.receivingAccountSince !== null,
    asaas:
      asaas === null
        ? null
        : {
            status: asaas.status,
            protectionMissing: asaas.lastError === PROTECTION_MISSING,
            reviewStatus: review.reviewStatus,
            documentsUrl: review.documentsUrl,
            connectedAt: asaas.connectedAt.toISOString(),
          },
    choice,
    receivingProvider: receiving.provider,
    mercadoPagoUsable: isMercadoPagoUsable(accounts.mercadoPago),
    asaasUsable: isAsaasUsable(asaas),
    protectionRequired: mustReceiveProtected(rule, confirmedDeliveries),
    deliveriesToGo: Math.max(0, rule.deliveries - confirmedDeliveries),
  };
}

function newAccountFrom(form: AsaasAccountForm): AsaasNewAccount {
  return {
    name: form.name,
    email: form.email,
    cpfCnpj: form.document,
    birthDate: form.personType === "person" ? form.birthDate : null,
    companyType: form.personType === "company" ? form.companyType : null,
    mobilePhone: form.mobilePhone,
    address: form.address,
    addressNumber: form.addressNumber,
    complement: form.complement === "" ? null : form.complement,
    province: form.province,
    postalCode: form.postalCode,
    incomeValueCents: form.monthlyIncome,
  };
}

/** Asaas's own words for a refused account (they name the field), or a generic message. */
function asaasRefusal(error: unknown): Error {
  if (error instanceof AsaasAccountKeyMissingError) {
    return validationError(
      "O Asaas abriu a conta, mas o SellBridge ainda não consegue cobrar por ela. Nossa equipe já foi avisada.",
    );
  }
  if (isAsaasError(error) && error.issues.length > 0 && !error.outcomeUnknown) {
    return validationError(`O Asaas recusou o cadastro: ${error.issues.join(" ")}`);
  }
  if (isAsaasError(error)) {
    logger.warn("asaas.account_not_opened", { error });
    return validationError(ASAAS_DOWN);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/**
 * Opens the supplier's Asaas account and turns its protection on. Only the supplier itself,
 * never a team visit; a supplier with an account already open is refused.
 */
export async function openSupplierAsaasAccount(input: {
  supplierId: string;
  userId: string;
  actor: PaymentAccountActor;
  form: AsaasAccountForm;
}): Promise<{ protectedNow: boolean }> {
  requireOwner(input.actor);
  const context = requireContext();
  const noticeEmail = asaasNoticeEmail();
  if (noticeEmail === null) {
    logger.error("asaas.notice_email_missing", {
      reason: "Defina ADMIN_EMAILS para abrir contas de fornecedores no Asaas.",
    });
    throw validationError(UNAVAILABLE);
  }
  const { asaas } = await receivingAccountsOf(input.supplierId);
  if (asaas !== null) {
    throw validationError("Sua conta no Asaas já foi aberta. Veja abaixo como ela está.");
  }
  try {
    const opened = await openAsaasAccount(context, {
      supplierId: input.supplierId,
      userId: input.userId,
      data: newAccountFrom(input.form),
      webhookUrl: asaasWebhookUrl(),
      noticeEmail,
    });
    return { protectedNow: opened.protectedNow };
  } catch (error) {
    throw asaasRefusal(error);
  }
}

/** Tries again to turn on the protection of an account opened without it. */
export async function retryAsaasProtection(input: {
  supplierId: string;
  actor: PaymentAccountActor;
}): Promise<{ protectedNow: boolean }> {
  requireOwner(input.actor);
  const context = requireContext();
  const { asaas } = await receivingAccountsOf(input.supplierId);
  if (asaas?.lastError !== PROTECTION_MISSING) {
    return { protectedNow: asaas?.status === "connected" };
  }
  return { protectedNow: await protectAsaasAccount(context, asaas) };
}

const CHOICE_REFUSALS: Readonly<Record<PaymentProviderName, string>> = {
  mercado_pago: "Ligue a conta Mercado Pago antes de escolher receber por ela.",
  asaas: "Sua conta no Asaas precisa estar aprovada antes de receber por ela.",
};

/**
 * Saves where new payments go. Payments already open or paid stay where they started; a new
 * supplier held to protected payments by the admin rule cannot pick Mercado Pago yet.
 */
export async function chooseReceivingProvider(input: {
  supplierId: string;
  provider: PaymentProviderName;
  userId: string;
  actor: PaymentAccountActor;
}): Promise<{ provider: PaymentProviderName }> {
  requireOwner(input.actor);
  const accounts = await receivingAccountsOf(input.supplierId);
  const usable =
    input.provider === "asaas"
      ? isAsaasUsable(accounts.asaas)
      : isMercadoPagoUsable(accounts.mercadoPago);
  if (!usable) {
    throw validationError(CHOICE_REFUSALS[input.provider]);
  }
  const heldByRule = mustReceiveProtected(accounts.rule, accounts.confirmedDeliveries);
  if (input.provider === "mercado_pago" && heldByRule) {
    throw validationError(
      `Fornecedores novos recebem com proteção até completar ${accounts.rule.deliveries} entregas.`,
    );
  }
  await saveSupplierPaymentChoice(database, {
    supplierId: input.supplierId,
    provider: input.provider,
    userId: input.userId,
  });
  logger.info("supplier_payments.provider_chosen", {
    supplierId: input.supplierId,
    provider: input.provider,
  });
  return { provider: input.provider };
}
