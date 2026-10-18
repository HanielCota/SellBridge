import type { SupplierOrdersUrlSearch } from "@sellbridge/shared/supplier-panel-orders-schema";
import {
  isQueueTab,
  SUPPLIER_ORDER_TAB_LABELS,
  SUPPLIER_ORDER_TABS,
  type SupplierOrderTab,
} from "@sellbridge/shared/supplier-panel-orders-tabs";
import { useQuery } from "@tanstack/react-query";
import { FilterTabs } from "@/components/data/filter-tabs";
import { SearchInput } from "@/components/data/search-input";
import { supplierShipmentCountsQueryOptions } from "@/features/supplier-panel/orders/orders.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";

/** Said above the list, so the order of the rows is never a guess. */
function sortDescription(tab: SupplierOrderTab): string {
  if (isQueueTab(tab)) {
    return "Atrasados primeiro, depois o prazo mais próximo.";
  }
  return "Mais recentes primeiro.";
}

/** The tabs with how many orders each holds (search applied), then the search box. */
export function OrderFilters({
  supplierId,
  search,
  onChange,
}: {
  supplierId: string;
  search: SupplierOrdersUrlSearch;
  onChange: (patch: Partial<SupplierOrdersUrlSearch>) => void;
}) {
  const counts = useQuery(supplierShipmentCountsQueryOptions(supplierId, search.query ?? ""));
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => onChange({ query, page: 1 }),
  });
  const tabs = SUPPLIER_ORDER_TABS.map((tab) => ({
    value: tab,
    label: SUPPLIER_ORDER_TAB_LABELS[tab],
    count: counts.data?.[tab],
  }));
  return (
    <div className="flex flex-col gap-3">
      {/* Eight tabs do not fit a phone: the track scrolls sideways instead of wrapping. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <FilterTabs
          legend="Etapa dos pedidos"
          tabs={tabs}
          value={search.tab}
          onChange={(tab) => onChange({ tab, page: 1 })}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          label="Buscar por número do pedido ou SKU"
          placeholder="Número do pedido ou SKU"
          value={term}
          onValueChange={setTerm}
          className="sm:max-w-sm sm:flex-1"
        />
        <p className="text-footnote text-muted-foreground">{sortDescription(search.tab)}</p>
      </div>
    </div>
  );
}
