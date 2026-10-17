import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { Button } from "@/components/ui/button";
import type { SupplierHomeCatalogFix } from "@/features/supplier-panel/home/home-types";
import { HomeListRow, HomePhoto } from "./home-list";

/** Where each kind of fix is made: the stock field, or the product with the review's reasons. */
function targetOf(fix: SupplierHomeCatalogFix): SupplierAttentionTarget {
  if (fix.kind === "out_of_stock") {
    return { area: "stock", filter: "out_of_stock_listed", productId: fix.productId };
  }
  return { area: "catalog", filter: "rejected", productId: fix.productId };
}

/** Out of stock reads amber: the listings keep taking orders the supplier cannot fill. */
function StatusWord({ fix }: { fix: SupplierHomeCatalogFix }) {
  if (fix.kind === "out_of_stock") {
    return (
      <span className="text-footnote font-medium whitespace-nowrap text-amber-700 dark:text-amber-300">
        Sem estoque
      </span>
    );
  }
  return <span className="text-footnote whitespace-nowrap text-muted-foreground">Reprovado</span>;
}

export function HomeCatalogRow({
  fix,
  expanded,
  onToggle,
  hrefFor,
}: {
  fix: SupplierHomeCatalogFix;
  expanded: boolean;
  onToggle: () => void;
  hrefFor: (target: SupplierAttentionTarget) => string;
}) {
  const soldOut = fix.kind === "out_of_stock";
  return (
    <HomeListRow
      id={`product-${fix.productId}`}
      expanded={expanded}
      onToggle={onToggle}
      photo={<HomePhoto imageUrl={fix.imageUrl} title={fix.title} soldOut={soldOut} />}
      title={fix.title}
      detail={<span className="truncate">{fix.reason}</span>}
      trailing={<StatusWord fix={fix} />}
    >
      <HomePhoto imageUrl={fix.imageUrl} title={fix.title} soldOut={soldOut} large />
      <Button size="sm" asChild>
        <a href={hrefFor(targetOf(fix))}>{soldOut ? "Atualizar estoque" : "Corrigir produto"}</a>
      </Button>
    </HomeListRow>
  );
}
