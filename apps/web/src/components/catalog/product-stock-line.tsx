import { ToneStatus } from "@/components/data/tone-status";

/** Units available, or a sold-out badge, at the foot of a product card. */
export function ProductStockLine({ stock }: { stock: number }) {
  if (stock <= 0) {
    return <ToneStatus tone="danger" label="Esgotado" />;
  }
  return <span className="text-xs text-muted-foreground">{stock} em estoque</span>;
}
