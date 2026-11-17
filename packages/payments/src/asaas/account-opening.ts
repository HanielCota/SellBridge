import {
  markAsaasAccountProtected,
  markSupplierPaymentAccountError,
  saveAsaasAccount,
  setPaymentAccountReview,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { ESCROW_SAFETY_DEADLINE_IN_DAYS } from "@sellbridge/shared/escrow-release";
import { logger } from "@sellbridge/shared/logger";
import {
  reviewStatusFromAsaas,
  type PaymentAccountReviewStatus,
} from "@sellbridge/shared/payment-accounts";
import { platformClient, withAsaasAccount } from "./account-access.ts";
import type { AsaasNewAccount } from "./client.ts";
import type { AsaasContext } from "./context.ts";

/** Asaas answered without the new account's key: SellBridge cannot charge in its name. */
export class AsaasAccountKeyMissingError extends Error {
  constructor(supplierId: string) {
    super(`Asaas returned no key for the new account of supplier ${supplierId}`);
    this.name = "AsaasAccountKeyMissingError";
  }
}

/** The account is open but its protection is not on yet: payments would not be held. */
export const PROTECTION_MISSING = "protection_missing";

async function turnProtectionOn(
  context: AsaasContext,
  account: SupplierPaymentAccount,
): Promise<boolean> {
  const providerAccountId = account.providerAccountId;
  if (providerAccountId === null) {
    logger.error("asaas.protection_failed", {
      supplierId: account.supplierId,
      reason: "account_id_missing",
    });
    return false;
  }
  try {
    const settings = await platformClient(context).protectAccount(
      providerAccountId,
      ESCROW_SAFETY_DEADLINE_IN_DAYS,
    );
    if (settings.enabled) {
      await markAsaasAccountProtected(context.database, account.id);
      return true;
    }
  } catch (error) {
    logger.error("asaas.protection_failed", { supplierId: account.supplierId, error });
  }
  return false;
}

/**
 * Turns the account's protection on: every payment it receives from now on is held for up to
 * the safety deadline, with the supplier paying Asaas's fee. A failure leaves the account in
 * error, so it never receives a payment that would not be held.
 */
export async function protectAsaasAccount(
  context: AsaasContext,
  account: SupplierPaymentAccount,
): Promise<boolean> {
  if (await turnProtectionOn(context, account)) {
    return true;
  }
  await markSupplierPaymentAccountError(context.database, {
    accountId: account.id,
    lastError: PROTECTION_MISSING,
    refreshTokenEnc: null,
  });
  return false;
}

/**
 * Opens the supplier's Asaas account with SellBridge's key, its notices pointed at SellBridge,
 * and protects it. The account's own key is kept encrypted.
 *
 * @throws {AsaasAccountKeyMissingError} When Asaas does not return the new account's key.
 */
export async function openAsaasAccount(
  context: AsaasContext,
  input: {
    supplierId: string;
    userId: string;
    data: AsaasNewAccount;
    webhookUrl: string;
    noticeEmail: string;
  },
): Promise<{ account: SupplierPaymentAccount; protectedNow: boolean }> {
  const created = await platformClient(context).createAccount(input.data, {
    url: input.webhookUrl,
    email: input.noticeEmail,
    authToken: context.settings.webhookToken,
  });
  if (created.apiKey === null) {
    logger.error("asaas.account_key_missing", {
      reason:
        "O Asaas abriu a conta do fornecedor mas não devolveu a chave dela: peça ao Asaas o modelo BaaS (chave das subcontas).",
      supplierId: input.supplierId,
      providerAccountId: created.accountId,
    });
    throw new AsaasAccountKeyMissingError(input.supplierId);
  }
  const account = await saveAsaasAccount(context.database, {
    supplierId: input.supplierId,
    userId: input.userId,
    providerAccountId: created.accountId,
    walletId: created.walletId,
    apiKeyEnc: context.cipher.encrypt(created.apiKey),
  });
  logger.info("asaas.account_opened", { supplierId: input.supplierId });
  return { account, protectedNow: await protectAsaasAccount(context, account) };
}

export interface AsaasAccountReview {
  readonly reviewStatus: PaymentAccountReviewStatus;
  /** Asaas's page where the supplier sends the documents still missing, when it offers one. */
  readonly documentsUrl: string | null;
}

/** Reads Asaas's review of the account's documents and keeps it. */
export async function refreshAsaasReview(
  context: AsaasContext,
  account: SupplierPaymentAccount,
): Promise<AsaasAccountReview> {
  const [status, documents] = await withAsaasAccount(context, account, async (client) =>
    Promise.all([client.accountStatus(), client.pendingDocuments()]),
  );
  const reviewStatus = reviewStatusFromAsaas(status.general);
  if (reviewStatus !== account.reviewStatus) {
    await setPaymentAccountReview(context.database, { accountId: account.id, reviewStatus });
  }
  const documentsUrl =
    documents.find((document) => document.onboardingUrl != null)?.onboardingUrl ?? null;
  return { reviewStatus, documentsUrl };
}
