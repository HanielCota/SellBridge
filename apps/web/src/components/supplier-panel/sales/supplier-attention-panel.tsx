import { countdownLabel } from "@sellbridge/shared/supplier-panel-orders";
import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { useQuery } from "@tanstack/react-query";
import { AttentionList } from "@/components/reports/attention-panel";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";
import type { SupplierHomeData } from "@/features/supplier-panel/home/home-types";
import type { SupplierSalesData } from "@/features/supplier-panel/sales/sales.queries";
import { buildSupplierAttention } from "@/features/supplier-panel/sales/supplier-attention";
import { useTabProfileLink } from "@/lib/tab-profile";

/** The first parcel waiting for the accept, as its countdown; the list is most urgent first. */
function firstAcceptOf(home: SupplierHomeData | undefined) {
  const first = home?.orders.accept[0];
  if (first === undefined) {
    return null;
  }
  return {
    label: countdownLabel(first),
    overdue: first.remainingMilliseconds !== null && first.remainingMilliseconds <= 0,
  };
}

/**
 * The reseller's "Precisa de você" with what only the supplier can fix (item 38): the accepts,
 * the stock, the rejected products and a support reply. It stands in for the old task list,
 * whose rows now live on Pedidos and Produtos.
 */
export function SupplierAttentionPanel({
  home,
  runningOut,
  hrefFor,
}: {
  home: SupplierHomeData | undefined;
  runningOut: SupplierSalesData["runningOut"];
  hrefFor: (target: SupplierAttentionTarget) => string;
}) {
  const counts = useQuery(attentionCountsQueryOptions());
  const profileLink = useTabProfileLink();
  const items = buildSupplierAttention(
    {
      ordersToAccept: home?.orderTotals.accept ?? 0,
      firstAccept: firstAcceptOf(home),
      runningOut,
      catalog: home?.catalog ?? [],
      unreadSupportReplies: counts.data?.unreadSupportReplies ?? 0,
    },
    hrefFor,
    profileLink("/suporte"),
  );
  return (
    <AttentionList
      items={items}
      allClearDescription="Nenhum pedido para aceitar, produto sem estoque ou para corrigir."
    />
  );
}
