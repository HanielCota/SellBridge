import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { Button } from "@/components/ui/button";
import type { SupplierHomeCatalogFix } from "@/features/supplier-panel/home/home-types";
import { HomeActionRow, HomePhoto } from "./home-list";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

/** Where each kind of fix is made: the stock field, or the product with the review's reasons. */
function targetOf(fix: SupplierHomeCatalogFix): SupplierAttentionTarget {
  if (fix.kind === "out_of_stock") {
    return { area: "stock", filter: "out_of_stock_listed", productId: fix.productId };
  }
  return {
    area: "catalog",
    filter: "rejected",
    productId: fix.productId,
    ...(fix.field === null ? {} : { field: fix.field }),
  };
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
  return (
    <HintedText
      label={TERM_HINTS.rejectedProduct}
      focusable={false}
      className="text-footnote whitespace-nowrap text-muted-foreground hinted-term"
    >
      Reprovado
    </HintedText>
  );
}

/** A catalog fix has one thing to do, so its button sits on the row instead of behind a tap. */
export function HomeCatalogRow({
  fix,
  hrefFor,
}: {
  fix: SupplierHomeCatalogFix;
  hrefFor: (target: SupplierAttentionTarget) => string;
}) {
  const soldOut = fix.kind === "out_of_stock";
  return (
    <HomeActionRow
      photo={<HomePhoto imageUrl={fix.imageUrl} title={fix.title} soldOut={soldOut} />}
      title={fix.title}
      detail={
        <>
          <StatusWord fix={fix} />
          <span aria-hidden="true">·</span>
          <span className="truncate">{fix.reason}</span>
        </>
      }
      action={
        <Button size="sm" asChild>
          <a href={hrefFor(targetOf(fix))}>{soldOut ? "Atualizar estoque" : "Corrigir produto"}</a>
        </Button>
      }
    />
  );
}
