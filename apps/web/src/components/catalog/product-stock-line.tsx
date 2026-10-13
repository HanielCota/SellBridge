import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus } from "@/components/data/tone-status";

/**
 * Units the reseller can still sell. With `updatedAt`, also when the admin last updated the
 * product (its count included), so an old number reads as old. Sold out needs no date: there is
 * nothing to act on.
 */
export function ProductStockLine({
  stock,
  updatedAt,
}: {
  stock: number;
  updatedAt?: Date | undefined;
}) {
  if (stock <= 0) {
    return <ToneStatus tone="danger" label="Esgotado" />;
  }
  if (updatedAt === undefined) {
    return <span className="text-xs text-muted-foreground">{stock} em estoque</span>;
  }
  // Two short lines, like the listing card's store and stock. The count never breaks; on a
  // narrow phone column the card footer moves the button below, and only the date may wrap.
  return (
    <span className="flex flex-col text-xs text-muted-foreground">
      <span className="whitespace-nowrap">{stock} em estoque</span>
      <span className="text-caption">
        atualizado <SmartDate date={updatedAt} />
      </span>
    </span>
  );
}
