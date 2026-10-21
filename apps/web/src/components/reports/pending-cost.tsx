import { ToneStatus } from "@/components/data/tone-status";

/**
 * Revenue of a sale whose cost is unknown ("custo pendente"): an item of a listing created
 * outside SellBridge. It counts as revenue and stays out of the profit, drawn in diagonal stripes
 * of the revenue's neutral gray so it reads as "not known yet" beside the solid costs.
 */
export const PENDING_HATCH_CLASS =
  "bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_1.5px,transparent_1.5px_4px)] opacity-70";

/** Why a sale is out of the profit, in the reseller's words. */
export const PENDING_COST_HINT =
  "Venda de um anúncio criado fora da SellBridge: sem o custo do produto, ela entra na receita e fica fora do lucro.";

/** The row's status where its profit would be. */
export function PendingCostStatus() {
  return <ToneStatus tone="warning" label="Custo pendente" />;
}
