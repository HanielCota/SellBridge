/**
 * The reseller price of new ERP products from one rule: "the reseller pays X% less than the ERP
 * price". The supplier can still change any single price afterwards.
 */

/** Largest discount accepted: a reseller price under 10% of the ERP price is a typo. */
export const MAX_RESELLER_DISCOUNT_TENTHS = 900;

/** "30" or "30,5": a whole percentage or one decimal, with a comma or a dot. */
const PERCENT_PATTERN = /^(\d{1,3})(?:[.,](\d))?$/;

export type DiscountParse =
  { readonly ok: true; readonly tenths: number } | { readonly ok: false; readonly message: string };

/** Reads the percentage the supplier typed into tenths of a percent (30,5% → 305). */
export function parseResellerDiscount(typed: string): DiscountParse {
  const text = typed.trim().replace(/%$/, "").trim();
  const match = PERCENT_PATTERN.exec(text);
  if (match === null) {
    return {
      ok: false,
      message: `Use um número de 0 a 90, como 30 ou 30,5 (recebido: "${typed.trim()}").`,
    };
  }
  const [, whole = "0", decimal = "0"] = match;
  const tenths = Number(whole) * 10 + Number(decimal);
  if (!Number.isSafeInteger(tenths) || tenths > MAX_RESELLER_DISCOUNT_TENTHS) {
    return {
      ok: false,
      message: `O desconto pode ser de 0 a 90% (recebido: ${typed.trim()}%).`,
    };
  }
  return { ok: true, tenths };
}

/**
 * The reseller price for an ERP price and a discount in tenths of a percent, rounded to the
 * nearest cent and never below 1 cent. Null when the ERP price or the discount is not usable.
 */
export function resellerPriceFromDiscount(
  erpPriceCents: number | null,
  tenths: number,
): number | null {
  if (erpPriceCents === null || !Number.isSafeInteger(erpPriceCents) || erpPriceCents <= 0) {
    return null;
  }
  if (!Number.isSafeInteger(tenths) || tenths < 0 || tenths > MAX_RESELLER_DISCOUNT_TENTHS) {
    return null;
  }
  const cents = Math.round((erpPriceCents * (1000 - tenths)) / 1000);
  return Math.max(1, cents);
}

/** Tenths of a percent as the field shows them: 300 → "30", 305 → "30,5". */
export function formatResellerDiscount(tenths: number): string {
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return decimal === 0 ? String(whole) : `${whole},${decimal}`;
}
