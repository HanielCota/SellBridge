import {
  PAYMENT_FEE_BASIS_POINTS,
  platformFeeCents,
  type SupplierPayMethod,
} from "./shipment-payments.ts";

/**
 * What a supplier keeps from a sale: the products' price minus SellBridge's 4% and the Asaas fee.
 * Asaas only tells its fee after the payment, so the screens show an estimate with Asaas's
 * published standard prices (asaas.com/precos-e-taxas, checked 23/11/2026).
 */

/** Asaas's standard fee for a Pix received, in cents. */
export const ASAAS_PIX_FEE_CENTS = 199;
/** Asaas's standard rate for a one-off credit card payment, in basis points (2,99%). */
export const ASAAS_CARD_FEE_BASIS_POINTS = 299;
/** Asaas's fixed part for a one-off credit card payment, in cents. */
export const ASAAS_CARD_FEE_FIXED_CENTS = 49;

const BASIS_POINTS_PER_WHOLE = 10_000;

export class InvalidSupplierAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSupplierAmountError";
  }
}

/** The split of a sold amount, every value in cents. */
export interface SupplierNetAmount {
  soldCents: number;
  platformFeeCents: number;
  asaasFeeCents: number;
  netCents: number;
}

function assertCents(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidSupplierAmountError(`${name} must be a non-negative integer: ${value}`);
  }
}

/**
 * The Asaas fee estimated for one payment of this amount, by the method it is paid with, in
 * cents, from Asaas's published standard prices.
 */
export function asaasFeeEstimateCents(amountCents: number, method: SupplierPayMethod): number {
  if (method === "PIX") {
    return ASAAS_PIX_FEE_CENTS;
  }
  return (
    Math.round((amountCents * ASAAS_CARD_FEE_BASIS_POINTS) / BASIS_POINTS_PER_WHOLE) +
    ASAAS_CARD_FEE_FIXED_CENTS
  );
}

/** SellBridge's share, with no share when nothing was sold. */
function platformShareCents(soldCents: number): number {
  if (soldCents === 0) {
    return 0;
  }
  return platformFeeCents(soldCents, PAYMENT_FEE_BASIS_POINTS);
}

/** Puts the fees against the sold amount, never leaving the supplier below zero. */
function splitOf(soldCents: number, asaasFeeCents: number): SupplierNetAmount {
  const platform = platformShareCents(soldCents);
  const asaas = Math.min(asaasFeeCents, soldCents - platform);
  return {
    soldCents,
    platformFeeCents: platform,
    asaasFeeCents: asaas,
    netCents: soldCents - platform - asaas,
  };
}

/**
 * Estimates what the supplier receives from one paid order.
 *
 * @param soldCents - The products' price, without shipping, in cents. A non-negative integer.
 * @returns The split; nothing sold gives zero everywhere, and the fees never exceed the price.
 * @throws {InvalidSupplierAmountError} When the amount is negative or not an integer.
 *
 * @example
 * supplierNetForOrder(10_000, "PIX").netCents; // 9401: R$ 100,00 − R$ 4,00 − R$ 1,99
 */
export function supplierNetForOrder(
  soldCents: number,
  method: SupplierPayMethod,
): SupplierNetAmount {
  assertCents("Sold amount", soldCents);
  if (soldCents === 0) {
    return splitOf(0, 0);
  }
  return splitOf(soldCents, asaasFeeEstimateCents(soldCents, method));
}

/**
 * Estimates what the supplier receives from several orders sold together (a month, a period),
 * each paid by Pix, the method most resellers use. The 4% is taken from the total.
 *
 * @param soldCents - The products' price of all the orders, without shipping, in cents.
 * @param orders - How many orders the amount covers; each one pays one Asaas fee.
 * @throws {InvalidSupplierAmountError} When either value is negative or not an integer.
 */
export function supplierNetForOrders(soldCents: number, orders: number): SupplierNetAmount {
  assertCents("Sold amount", soldCents);
  if (!Number.isInteger(orders) || orders < 0) {
    throw new InvalidSupplierAmountError(`Order count must be a non-negative integer: ${orders}`);
  }
  return splitOf(soldCents, orders * ASAAS_PIX_FEE_CENTS);
}
