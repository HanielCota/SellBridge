import { MAX_PAYMENT_FEE_BASIS_POINTS } from "@sellbridge/shared/shipment-payments";

const BASIS_POINTS_PER_PERCENT = 100;
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** "5%", "4,5%": a fee rate in basis points, as the screens write it. */
export function formatFeePercent(basisPoints: number): string {
  return `${percentFormat.format(basisPoints / BASIS_POINTS_PER_PERCENT)}%`;
}

export type FeePercentReading = { ok: true; basisPoints: number } | { ok: false; message: string };

/**
 * Reads what the admin typed ("5", "4,5", "4.5") into basis points, with the message that says
 * how to fix it when it cannot be used.
 */
export function readFeePercent(typed: string): FeePercentReading {
  const text = typed.trim().replace("%", "").trim().replace(",", ".");
  if (text === "") {
    return { ok: false, message: "Escreva a taxa. Exemplo: 5" };
  }
  if (!/^\d{1,2}(\.\d)?$/.test(text)) {
    return {
      ok: false,
      message: "Use só números, com no máximo uma casa depois da vírgula. Exemplo: 4,5",
    };
  }
  const basisPoints = Math.round(Number(text) * BASIS_POINTS_PER_PERCENT);
  if (!Number.isFinite(basisPoints) || basisPoints > MAX_PAYMENT_FEE_BASIS_POINTS) {
    return { ok: false, message: "A taxa vai de 0 a 30%. Diminua o valor." };
  }
  return { ok: true, basisPoints };
}
