import type { StatusTone } from "@/components/data/tone-status";
import { STOCK_RUNNING_OUT_DAYS } from "@sellbridge/shared/supplier-panel-sales";

/** Beyond this, a day count reads as noise: "mais de 90 dias" is all the supplier needs. */
const LONG_STOCK_DAYS = 90;

/**
 * How a best seller's stock reads on the home, from `stockDaysLeft`: a dot and a phrase, so the
 * warning never depends on color alone.
 */
export function stockForecast(daysLeft: number | null): { tone: StatusTone; label: string } {
  if (daysLeft === null) {
    return { tone: "muted", label: "Sem previsão de estoque" };
  }
  if (daysLeft === 0) {
    return { tone: "danger", label: "Sem estoque" };
  }
  if (daysLeft <= STOCK_RUNNING_OUT_DAYS) {
    return { tone: "danger", label: `Acaba em ~${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}` };
  }
  if (daysLeft > LONG_STOCK_DAYS) {
    return { tone: "success", label: `Estoque para mais de ${LONG_STOCK_DAYS} dias` };
  }
  return { tone: "success", label: `Estoque para ~${daysLeft} dias` };
}
