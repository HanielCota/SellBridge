import type { SupplierSalesSituation } from "@sellbridge/shared/supplier-panel-sales";

/** How the home names the money and the pieces of the orders on screen. */
export interface SupplierAmountLabels {
  amount: string;
  amountInPeriod: string;
  units: string;
  unitsInPeriod: string;
}

const RECEIVED: SupplierAmountLabels = {
  amount: "A receber",
  amountInPeriod: "A receber no período",
  units: "Peças vendidas",
  unitsInPeriod: "Peças vendidas no período",
};

/** Cancelled and returned orders are money that stayed out, as the period sentence says. */
const LEFT_OUT: SupplierAmountLabels = {
  amount: "Ficou de fora",
  amountInPeriod: "Ficou de fora no período",
  units: "Peças canceladas ou devolvidas",
  unitsInPeriod: "Peças canceladas ou devolvidas no período",
};

export function supplierAmountLabels(situation: SupplierSalesSituation): SupplierAmountLabels {
  return situation === "lost" ? LEFT_OUT : RECEIVED;
}
