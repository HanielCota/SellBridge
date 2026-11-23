/** The cutoff rule as the settings form holds it: the switch and each time as "HH:MM". */
export interface CutoffChoice {
  enabled: boolean;
  mercadoLivre: string;
  shopee: string;
  tiktokShop: string;
}

function timesChanged(saved: CutoffChoice, choice: CutoffChoice): boolean {
  return (
    saved.mercadoLivre !== choice.mercadoLivre ||
    saved.shopee !== choice.shopee ||
    saved.tiktokShop !== choice.tiktokShop
  );
}

/**
 * What saving changes, written before the click; null when nothing the admin should weigh
 * changes. The cutoff is read on every query, so a new time also moves the date of parcels
 * already with the supplier.
 */
export function cutoffConsequence(saved: CutoffChoice, choice: CutoffChoice): string | null {
  if (choice.enabled && !saved.enabled) {
    return "Ao salvar: os pedidos que chegarem daqui em diante e não tiverem a data do marketplace passam a ter prazo de postagem pelo horário de corte. Os pedidos que já estão com o fornecedor continuam com o prazo de antes.";
  }
  if (!choice.enabled && saved.enabled) {
    return "Ao salvar: os pedidos sem data do marketplace voltam a usar o prazo em horas de cada fornecedor.";
  }
  if (choice.enabled && timesChanged(saved, choice)) {
    return "Ao salvar: o novo horário vale também para os pedidos que já estão com o fornecedor. O prazo deles pode mudar, e algum pode passar a aparecer como atrasado.";
  }
  return null;
}
