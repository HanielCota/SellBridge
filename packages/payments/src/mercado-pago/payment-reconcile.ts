import {
  findShipmentPaymentById,
  listShipmentPaymentCheckouts,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { supplierAccessToken, withSupplierAccount } from "./account-access.ts";
import { listPreferencePaymentIds } from "./client.ts";
import type { MercadoPagoContext } from "./context.ts";
import { syncMercadoPagoPayment } from "./payment-sync.ts";

/**
 * Asks Mercado Pago for every payment made through every checkout SellBridge opened for the
 * parcel, and records each one as a notice would. A lost or late notice can then never leave the
 * parcel looking unpaid. Returns the parcel payment as it stands afterwards.
 *
 * @throws {PaymentAccountUnavailableError} When the supplier's account is not linked or refused.
 * @throws {MercadoPagoError} When Mercado Pago cannot be reached or answers with an error.
 */
export async function reconcileShipmentPayment(
  context: MercadoPagoContext,
  input: { account: SupplierPaymentAccount; payment: ShipmentPayment },
): Promise<ShipmentPayment | null> {
  const { account, payment } = input;
  const checkouts = await listShipmentPaymentCheckouts(context.database, payment.id);
  if (checkouts.length === 0) {
    return payment;
  }
  const accessToken = await supplierAccessToken(context, account);
  const listed = await Promise.all(
    checkouts.map(async (checkout) => ({
      checkout,
      paymentIds: await withSupplierAccount(context, account, async () =>
        listPreferencePaymentIds(context.settings, {
          accessToken,
          preferenceId: checkout.preferenceId,
        }),
      ),
    })),
  );
  const found = listed.flatMap(({ checkout, paymentIds }) =>
    paymentIds.map((providerPaymentId) => ({ checkout, providerPaymentId })),
  );
  // In order: each payment is judged against what the previous ones left on the parcel.
  for (const { checkout, providerPaymentId } of found) {
    await syncMercadoPagoPayment(context, { account, providerPaymentId, knownCheckout: checkout });
  }
  return findShipmentPaymentById(context.database, payment.id);
}
