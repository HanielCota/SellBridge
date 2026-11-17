import {
  DEFAULT_NEW_SUPPLIER_DELIVERIES,
  type PaymentAccountReviewStatus,
  type PaymentProviderName,
} from "@sellbridge/shared/payment-accounts";
import { and, count, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orderShipments,
  platformSettings,
  shipmentPayments,
  supplierPaymentAccounts,
  supplierPaymentChoices,
} from "../schema/index.ts";
import type { SupplierPaymentAccount } from "./supplier-payments.ts";

/**
 * Saves the supplier's new Asaas account: its key encrypted, its wallet for the split, and its
 * documents waiting for Asaas's review. Opening it again replaces the old key.
 */
export async function saveAsaasAccount(
  database: Database,
  input: {
    supplierId: string;
    userId: string | null;
    providerAccountId: string;
    walletId: string;
    apiKeyEnc: string;
  },
): Promise<SupplierPaymentAccount> {
  const values = {
    accessTokenEnc: input.apiKeyEnc,
    refreshTokenEnc: null,
    expiresAt: null,
    providerAccountId: input.providerAccountId,
    walletId: input.walletId,
    reviewStatus: "pending" as const,
    status: "connected" as const,
    lastError: null,
    connectedByUserId: input.userId,
    connectedAt: new Date(),
  };
  const [row] = await database
    .insert(supplierPaymentAccounts)
    .values({ supplierId: input.supplierId, provider: "asaas", ...values })
    .onConflictDoUpdate({
      target: [supplierPaymentAccounts.supplierId, supplierPaymentAccounts.provider],
      set: values,
    })
    .returning();
  if (row === undefined) {
    throw new Error(`Asaas account not saved for supplier ${input.supplierId}`);
  }
  return row;
}

/** Records where Asaas's review of the account's documents stands. */
export async function setPaymentAccountReview(
  database: Database,
  input: { accountId: string; reviewStatus: PaymentAccountReviewStatus },
): Promise<void> {
  await database
    .update(supplierPaymentAccounts)
    .set({ reviewStatus: input.reviewStatus })
    .where(eq(supplierPaymentAccounts.id, input.accountId));
}

export async function findSupplierPaymentChoice(
  database: Database,
  supplierId: string,
): Promise<PaymentProviderName | null> {
  const [row] = await database
    .select({ provider: supplierPaymentChoices.provider })
    .from(supplierPaymentChoices)
    .where(eq(supplierPaymentChoices.supplierId, supplierId));
  return row?.provider ?? null;
}

/** The supplier's choice for new payments; payments already open or paid keep their provider. */
export async function saveSupplierPaymentChoice(
  database: Database,
  input: { supplierId: string; provider: PaymentProviderName; userId: string },
): Promise<void> {
  const values = { provider: input.provider, chosenByUserId: input.userId, chosenAt: new Date() };
  await database
    .insert(supplierPaymentChoices)
    .values({ supplierId: input.supplierId, ...values })
    .onConflictDoUpdate({ target: supplierPaymentChoices.supplierId, set: values });
}

/** The supplier's parcels delivered (only the marketplace or the reseller confirms a delivery). */
export async function countConfirmedDeliveries(
  database: Database,
  supplierId: string,
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(orderShipments)
    .where(and(eq(orderShipments.supplierId, supplierId), eq(orderShipments.status, "delivered")));
  return row?.total ?? 0;
}

export interface NewSupplierRuleSetting {
  enabled: boolean;
  deliveries: number;
}

const DEFAULT_NEW_SUPPLIER_RULE: NewSupplierRuleSetting = {
  enabled: false,
  deliveries: DEFAULT_NEW_SUPPLIER_DELIVERIES,
};

export async function getNewSupplierRule(database: Database): Promise<NewSupplierRuleSetting> {
  const [row] = await database
    .select({
      enabled: platformSettings.newSupplierProtection,
      deliveries: platformSettings.newSupplierDeliveries,
    })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  return row ?? DEFAULT_NEW_SUPPLIER_RULE;
}

/** Saves the rule; the database refuses a number of deliveries outside 1–1000. */
export async function setNewSupplierRule(
  database: Database,
  input: NewSupplierRuleSetting & { userId: string },
): Promise<NewSupplierRuleSetting> {
  const values = {
    newSupplierProtection: input.enabled,
    newSupplierDeliveries: input.deliveries,
    updatedByUserId: input.userId,
    updatedAt: new Date(),
  };
  const [row] = await database
    .insert(platformSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: platformSettings.id, set: values })
    .returning();
  if (row === undefined) {
    throw new Error("Platform settings not saved");
  }
  return { enabled: row.newSupplierProtection, deliveries: row.newSupplierDeliveries };
}

/** The guarantee holding a paid parcel's money, as last read from Asaas. */
export async function saveShipmentPaymentEscrow(
  database: Database,
  input: {
    paymentId: string;
    escrowId: string;
    escrowStatus: "active" | "done";
    escrowExpiresAt: Date;
  },
): Promise<void> {
  await database
    .update(shipmentPayments)
    .set({
      escrowId: input.escrowId,
      escrowStatus: input.escrowStatus,
      escrowExpiresAt: input.escrowExpiresAt,
    })
    .where(eq(shipmentPayments.id, input.paymentId));
}

/** Puts back in service an account whose protection was missing and is now on. */
export async function markAsaasAccountProtected(
  database: Database,
  accountId: string,
): Promise<void> {
  await database
    .update(supplierPaymentAccounts)
    .set({ status: "connected", lastError: null })
    .where(
      and(
        eq(supplierPaymentAccounts.id, accountId),
        eq(supplierPaymentAccounts.lastError, "protection_missing"),
      ),
    );
}
