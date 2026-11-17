import {
  countConfirmedDeliveries,
  findSupplierPaymentAccount,
  findSupplierPaymentChoice,
  getNewSupplierRule,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { asaasSettingsFrom, type AsaasContext } from "@sellbridge/payments/asaas";
import {
  receivingProviderFor,
  type NewSupplierRule,
  type PaymentProviderName,
  type ReceivingProvider,
} from "@sellbridge/shared/payment-accounts";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tokenCipher } from "@/lib/server/marketplaces";
import { mercadoPagoSettings } from "./mercado-pago-accounts.server";

export const ASAAS_WEBHOOK_PATH = "/api/webhooks/asaas";

/** The web app's database, cipher and Asaas settings, or null while protected payments are off. */
export function asaasContext(): AsaasContext | null {
  const settings = asaasSettingsFrom(environment);
  if (settings === null) {
    return null;
  }
  return { database, cipher: tokenCipher, settings };
}

export function asaasWebhookUrl(): string {
  return new URL(ASAAS_WEBHOOK_PATH, environment.APP_URL).toString();
}

/** Who Asaas warns when its notices to SellBridge keep failing: the first platform owner. */
export function asaasNoticeEmail(): string | null {
  return environment.ADMIN_EMAILS[0] ?? null;
}

/** A Mercado Pago account SellBridge can charge through now. */
export function isMercadoPagoUsable(account: SupplierPaymentAccount | null): boolean {
  return mercadoPagoSettings() !== null && account?.status === "connected";
}

/** An Asaas account SellBridge can charge through now: approved by Asaas and protected. */
export function isAsaasUsable(account: SupplierPaymentAccount | null): boolean {
  return (
    asaasContext() !== null &&
    account?.status === "connected" &&
    account.reviewStatus === "approved"
  );
}

export interface ReceivingAccounts {
  readonly mercadoPago: SupplierPaymentAccount | null;
  readonly asaas: SupplierPaymentAccount | null;
  readonly choice: PaymentProviderName | null;
  readonly rule: NewSupplierRule;
  readonly confirmedDeliveries: number;
  /** Where a new payment to this supplier goes now, or why it cannot be paid here. */
  readonly receiving: ReceivingProvider;
}

/** Both of the supplier's accounts, its choice and the admin rule, read at once. */
export async function receivingAccountsOf(supplierId: string): Promise<ReceivingAccounts> {
  const [mercadoPago, asaas, choice, rule, confirmedDeliveries] = await Promise.all([
    findSupplierPaymentAccount(database, { supplierId, provider: "mercado_pago" }),
    findSupplierPaymentAccount(database, { supplierId, provider: "asaas" }),
    findSupplierPaymentChoice(database, supplierId),
    getNewSupplierRule(database),
    countConfirmedDeliveries(database, supplierId),
  ]);
  const receiving = receivingProviderFor({
    mercadoPagoUsable: isMercadoPagoUsable(mercadoPago),
    asaasUsable: isAsaasUsable(asaas),
    choice,
    rule,
    confirmedDeliveries,
  });
  return { mercadoPago, asaas, choice, rule, confirmedDeliveries, receiving };
}
