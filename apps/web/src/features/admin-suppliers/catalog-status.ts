/** "1 anúncio pausado", "3 anúncios pausados"; null when nothing was paused. */
export function pausedListingsLabel(pausedTargets: number): string | null {
  if (pausedTargets <= 0) {
    return null;
  }
  return pausedTargets === 1 ? "1 anúncio pausado" : `${pausedTargets} anúncios pausados`;
}

/** The toast after switching a product or supplier on or off, with the listings it paused. */
export function catalogStatusMessage(
  subject: "Produto" | "Fornecedor",
  result: { active: boolean; pausedTargets: number },
): string {
  const status = `${subject} ${result.active ? "ativado" : "desativado"}`;
  const paused = pausedListingsLabel(result.pausedTargets);
  return paused === null ? status : `${status} · ${paused}`;
}

const MISSING_LIST = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

export interface ProductSaleStatus {
  readonly tone: "success" | "warning" | "danger" | "info" | "muted";
  readonly label: string;
  /** Why a draft is off sale, in the team's words; null when there is nothing to fix. */
  readonly detail: string | null;
}

/** Where a supplier product stands for the team, and what keeps a draft off sale. */
export function productSaleStatus(product: {
  active: boolean;
  reviewStatus: "draft" | "in_review" | "approved" | "rejected";
  missingForSale: readonly string[];
}): ProductSaleStatus {
  if (!product.active) {
    return { tone: "muted", label: "Desativado", detail: null };
  }
  if (product.reviewStatus === "rejected") {
    return { tone: "danger", label: "Reprovado", detail: null };
  }
  if (product.reviewStatus === "in_review") {
    return { tone: "info", label: "Em análise", detail: null };
  }
  if (product.reviewStatus === "approved") {
    return { tone: "success", label: "Ativo", detail: null };
  }
  // A draft the NF-e and weight rule does not hold is the supplier's own: a team save leaves it.
  if (product.missingForSale.length === 0) {
    return {
      tone: "warning",
      label: "Rascunho",
      detail: "O fornecedor ainda não publicou no painel dele",
    };
  }
  return {
    tone: "warning",
    label: "Rascunho",
    detail: `Falta ${MISSING_LIST.format(product.missingForSale)}. Preencha em Editar para pôr à venda`,
  };
}
