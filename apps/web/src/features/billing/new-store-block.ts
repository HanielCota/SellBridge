/** Why a new store cannot be connected now (no plan, or the plan is full). */
export type NewStoreBlock = { kind: "choose_plan" } | { kind: "plan_full"; planName: string };

/** What the stores page says in place of the marketplaces when no new store fits. */
export function newStoreBlockCopy(block: NewStoreBlock): string {
  if (block.kind === "choose_plan") {
    return "Para conectar uma loja, escolha um plano.";
  }
  return `Seu plano ${block.planName} já está com todas as lojas. Para conectar outra, mude para um plano maior.`;
}
