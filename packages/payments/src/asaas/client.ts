import { asaasRequest, type AsaasHttpOptions, type AsaasRequest } from "./http.ts";
import { asaasValueFromCents } from "./money.ts";
import {
  asaasAccountStatusSchema,
  asaasCreatedAccountSchema,
  asaasCustomerListSchema,
  asaasCustomerSchema,
  asaasDeletedSchema,
  asaasEscrowSchema,
  asaasEscrowSettingsSchema,
  asaasPaymentListSchema,
  asaasPaymentSchema,
  asaasPendingDocumentListSchema,
  type AsaasPayment,
} from "./schemas.ts";

/** Payment and account-status events a supplier account sends to SellBridge's endpoint. */
export const ASAAS_WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "ACCOUNT_STATUS_DOCUMENT_APPROVED",
  "ACCOUNT_STATUS_DOCUMENT_REJECTED",
  "ACCOUNT_STATUS_DOCUMENT_PENDING",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL",
] as const;

/** The supplier's data for its Asaas account (`POST /v3/accounts`). */
export interface AsaasNewAccount {
  readonly name: string;
  readonly email: string;
  /** Digits only. */
  readonly cpfCnpj: string;
  /** `YYYY-MM-DD`; only for a person (CPF). */
  readonly birthDate: string | null;
  /** MEI, LIMITED, INDIVIDUAL or ASSOCIATION; only for a company (CNPJ). */
  readonly companyType: string | null;
  readonly mobilePhone: string;
  readonly address: string;
  readonly addressNumber: string;
  readonly complement: string | null;
  readonly province: string;
  readonly postalCode: string;
  /** Monthly income or revenue, in cents. */
  readonly incomeValueCents: number;
}

/** Where the new account sends its events (created together with the account). */
export interface AsaasWebhookTarget {
  readonly url: string;
  /** Who Asaas warns when deliveries fail. */
  readonly email: string;
  /** 32 to 255 characters, sent back in the `asaas-access-token` header. */
  readonly authToken: string;
}

export interface AsaasCreatedAccount {
  readonly accountId: string;
  readonly walletId: string;
  /** The account's own key; null when Asaas did not return it. */
  readonly apiKey: string | null;
}

export interface AsaasNewCharge {
  readonly customerId: string;
  readonly amountCents: number;
  /** `YYYY-MM-DD`. */
  readonly dueDate: string;
  readonly description: string;
  /** SellBridge's id of the parcel payment: the only key for finding the charge again. */
  readonly externalReference: string;
  /** SellBridge's wallet and share, paid out by the split. */
  readonly platformWalletId: string;
  readonly platformFeeCents: number;
  /** Where Asaas sends the payer after paying. */
  readonly successUrl: string;
}

function newAccountBody(account: AsaasNewAccount, webhook: AsaasWebhookTarget) {
  return {
    name: account.name,
    email: account.email,
    cpfCnpj: account.cpfCnpj,
    ...(account.birthDate === null ? {} : { birthDate: account.birthDate }),
    ...(account.companyType === null ? {} : { companyType: account.companyType }),
    mobilePhone: account.mobilePhone,
    address: account.address,
    addressNumber: account.addressNumber,
    ...(account.complement === null ? {} : { complement: account.complement }),
    province: account.province,
    postalCode: account.postalCode,
    incomeValue: asaasValueFromCents(account.incomeValueCents),
    // Asaas returns the payer only to the site registered on the account that issues the charge
    // (sandbox, 18/11/2026: "Não há nenhum domínio configurado em sua conta"): SellBridge's.
    site: new URL(webhook.url).origin,
    webhooks: [
      {
        name: "SellBridge",
        url: webhook.url,
        email: webhook.email,
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: webhook.authToken,
        sendType: "SEQUENTIALLY",
        events: [...ASAAS_WEBHOOK_EVENTS],
      },
    ],
  };
}

function newChargeBody(charge: AsaasNewCharge) {
  const split =
    charge.platformFeeCents === 0
      ? []
      : [
          {
            walletId: charge.platformWalletId,
            fixedValue: asaasValueFromCents(charge.platformFeeCents),
          },
        ];
  return {
    customer: charge.customerId,
    // The payer picks Pix, card (one installment) or boleto on Asaas's page.
    billingType: "UNDEFINED",
    value: asaasValueFromCents(charge.amountCents),
    dueDate: charge.dueDate,
    description: charge.description,
    externalReference: charge.externalReference,
    split,
    callback: { successUrl: charge.successUrl, autoRedirect: true },
  };
}

/** Calls made with SellBridge's own key: opening supplier accounts, protecting them and releasing. */
export function createAsaasPlatformClient(http: AsaasHttpOptions, apiKey: string) {
  return {
    async createAccount(
      account: AsaasNewAccount,
      webhook: AsaasWebhookTarget,
    ): Promise<AsaasCreatedAccount> {
      const created = await asaasRequest(http, {
        apiKey,
        path: "/accounts",
        method: "POST",
        body: newAccountBody(account, webhook),
        schema: asaasCreatedAccountSchema,
      });
      return { accountId: created.id, walletId: created.walletId, apiKey: created.apiKey ?? null };
    },

    /**
     * Ends a supplier account's guarantee and frees the money to it. Final: never sent twice.
     * Only SellBridge's key may end it; the supplier's own key gets 404 (sandbox, 18/11/2026).
     */
    async releaseEscrow(escrowId: string): Promise<AsaasPayment> {
      return asaasRequest(http, {
        apiKey,
        path: `/escrow/${encodeURIComponent(escrowId)}/finish`,
        method: "POST",
        schema: asaasPaymentSchema,
      });
    },

    /** Holds every payment the account receives from now on, with the account paying the fee. */
    async protectAccount(accountId: string, daysToExpire: number) {
      return asaasRequest(http, {
        apiKey,
        path: `/accounts/${encodeURIComponent(accountId)}/escrow`,
        method: "POST",
        body: { enabled: true, daysToExpire, isFeePayer: true },
        schema: asaasEscrowSettingsSchema,
      });
    },
  };
}

/** One call with the supplier account's key. */
type AccountCall = <Result>(request: AsaasRequest<Result>) => Promise<Result>;

function paymentPath(paymentId: string, suffix = ""): string {
  return `/payments/${encodeURIComponent(paymentId)}${suffix}`;
}

function customerCalls(call: AccountCall) {
  return {
    async findCustomerId(externalReference: string): Promise<string | null> {
      const query = new URLSearchParams({ externalReference, limit: "1" }).toString();
      const list = await call({ path: `/customers?${query}`, schema: asaasCustomerListSchema });
      return list.data[0]?.id ?? null;
    },

    async createCustomer(customer: {
      name: string;
      cpfCnpj: string;
      externalReference: string;
    }): Promise<string> {
      const created = await call({
        path: "/customers",
        method: "POST",
        body: { ...customer, notificationDisabled: true },
        schema: asaasCustomerSchema,
      });
      return created.id;
    },
  };
}

function chargeCalls(call: AccountCall) {
  return {
    /** Every charge carrying the reference: there should be at most one. */
    async findCharges(externalReference: string): Promise<AsaasPayment[]> {
      const query = new URLSearchParams({ externalReference, limit: "100" }).toString();
      const list = await call({ path: `/payments?${query}`, schema: asaasPaymentListSchema });
      return list.data;
    },

    async createCharge(charge: AsaasNewCharge): Promise<AsaasPayment> {
      return call({
        path: "/payments",
        method: "POST",
        body: newChargeBody(charge),
        schema: asaasPaymentSchema,
      });
    },

    async getCharge(paymentId: string): Promise<AsaasPayment> {
      return call({ path: paymentPath(paymentId), schema: asaasPaymentSchema });
    },

    /** Removes an unpaid charge. Removing never refunds money already paid. */
    async deleteCharge(paymentId: string): Promise<boolean> {
      const result = await call({
        path: paymentPath(paymentId),
        method: "DELETE",
        schema: asaasDeletedSchema,
      });
      return result.deleted;
    },
  };
}

function heldMoneyCalls(call: AccountCall) {
  return {
    async getChargeEscrow(paymentId: string) {
      return call({ path: paymentPath(paymentId, "/escrow"), schema: asaasEscrowSchema });
    },

    /** Gives the whole payment back to the payer; the split shares are refunded with it. */
    async refundCharge(paymentId: string, description: string): Promise<AsaasPayment> {
      return call({
        path: paymentPath(paymentId, "/refund"),
        method: "POST",
        body: { description },
        schema: asaasPaymentSchema,
      });
    },
  };
}

function accountReviewCalls(call: AccountCall) {
  return {
    async pendingDocuments() {
      const list = await call({
        path: "/myAccount/documents",
        schema: asaasPendingDocumentListSchema,
      });
      return list.data;
    },

    async accountStatus() {
      return call({ path: "/myAccount/status", schema: asaasAccountStatusSchema });
    },
  };
}

/** Calls made with a supplier account's own key: its customers, charges and held money. */
export function createAsaasAccountClient(http: AsaasHttpOptions, apiKey: string) {
  const call: AccountCall = async (request) => asaasRequest(http, { ...request, apiKey });
  return {
    ...customerCalls(call),
    ...chargeCalls(call),
    ...heldMoneyCalls(call),
    ...accountReviewCalls(call),
  };
}

export type AsaasPlatformClient = ReturnType<typeof createAsaasPlatformClient>;
export type AsaasAccountClient = ReturnType<typeof createAsaasAccountClient>;
