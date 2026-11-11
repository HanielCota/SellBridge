import { resolvePeriod } from "@sellbridge/shared/period-range";
import { MARKETPLACES, OPERATION_PERIODS } from "@sellbridge/shared/schemas";
import {
  SUPPLIER_LABEL_STATE_LABELS,
  SUPPLIER_LABEL_STATES,
  type SupplierLabelState,
} from "@sellbridge/shared/supplier-order-labels";
import type { SupplierOrdersUrlSearch } from "@sellbridge/shared/supplier-panel-orders-schema";
import {
  isQueueTab,
  SUPPLIER_ORDER_TAB_LABELS,
  SUPPLIER_ORDER_TABS,
  type SupplierOrderTab,
} from "@sellbridge/shared/supplier-panel-orders-tabs";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { FilterTabs } from "@/components/data/filter-tabs";
import { SearchInput } from "@/components/data/search-input";
import { PeriodFilters } from "@/components/reports/period-filters";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activeOrderFilterCount,
  filterButtonLabel,
} from "@/features/supplier-panel/orders/active-filters";
import { CHANNEL_LABELS } from "@/features/supplier-panel/orders/channel-labels";
import {
  shipmentFiltersOf,
  supplierResellerStoresQueryOptions,
  supplierShipmentCountsQueryOptions,
} from "@/features/supplier-panel/orders/orders.queries";
import { useNow } from "@/hooks/use-now";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { cn } from "@/lib/utils";

const EVERY = "__all__";
const SELECT_CLASS_NAME = "w-full min-w-44 rounded-full sm:w-auto";

/** Said above the list, so the order of the rows is never a guess. */
function sortDescription(tab: SupplierOrderTab): string {
  if (isQueueTab(tab)) {
    return "Atrasados primeiro, depois o prazo mais próximo.";
  }
  return "Mais recentes primeiro.";
}

/** A design-system select with "Todos" first; the value is undefined when nothing is picked. */
function OptionSelect<TValue extends string>({
  label,
  everyLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  everyLabel: string;
  options: readonly { value: TValue; label: string }[];
  value: TValue | undefined;
  onChange: (value: TValue | undefined) => void;
}) {
  return (
    <Select
      value={value ?? EVERY}
      onValueChange={(next) => onChange(options.find((option) => option.value === next)?.value)}
    >
      <SelectTrigger aria-label={label} className={SELECT_CLASS_NAME}>
        <SelectValue>
          {options.find((option) => option.value === value)?.label ?? everyLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EVERY}>{everyLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const CHANNEL_OPTIONS = MARKETPLACES.map((channel) => ({
  value: channel,
  label: CHANNEL_LABELS[channel],
}));
const LABEL_OPTIONS = SUPPLIER_LABEL_STATES.map((state) => ({
  value: state,
  label: SUPPLIER_LABEL_STATE_LABELS[state],
}));

/** Sale date, reseller store, channel and label: the reports' period controls plus the screen's own. */
function ShipmentPeriodFilters({
  supplierId,
  search,
  onChange,
}: {
  supplierId: string;
  search: SupplierOrdersUrlSearch;
  onChange: (patch: Partial<SupplierOrdersUrlSearch>) => void;
}) {
  const stores = useQuery(supplierResellerStoresQueryOptions(supplierId));
  const now = useNow();
  // A custom range opens on the last 30 days; "Tudo" has no dates of its own.
  const shown = resolvePeriod(
    { period: search.period === "all" ? "30d" : search.period, from: search.from, to: search.to },
    now,
  );
  return (
    <PeriodFilters
      search={search}
      presets={OPERATION_PERIODS}
      stores={stores.data ?? []}
      resolvedFrom={shown.fromDate}
      resolvedTo={shown.toDate}
      onChange={(patch) => onChange({ ...patch, page: 1 })}
      extra={
        <>
          <OptionSelect<(typeof MARKETPLACES)[number]>
            label="Canal"
            everyLabel="Todos os canais"
            options={CHANNEL_OPTIONS}
            value={search.channel}
            onChange={(channel) => onChange({ channel, page: 1 })}
          />
          <OptionSelect<SupplierLabelState>
            label="Etiqueta"
            everyLabel="Todas as etiquetas"
            options={LABEL_OPTIONS}
            value={search.label}
            onChange={(label) => onChange({ label, page: 1 })}
          />
        </>
      }
    />
  );
}

/** The tabs with how many orders each holds (filters applied), the search and the filters. */
export function OrderFilters({
  supplierId,
  search,
  onChange,
}: {
  supplierId: string;
  search: SupplierOrdersUrlSearch;
  onChange: (patch: Partial<SupplierOrdersUrlSearch>) => void;
}) {
  const counts = useQuery(
    supplierShipmentCountsQueryOptions(shipmentFiltersOf(supplierId, search)),
  );
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
      <SearchInput
        label="Buscar por pedido, rastreio, cliente, loja ou código"
        placeholder="Pedido, rastreio, cliente, loja ou código"
        value={term}
        onValueChange={setTerm}
        className="sm:max-w-md"
      />
      <FoldedOnPhone active={activeOrderFilterCount(search)}>
        <ShipmentPeriodFilters supplierId={supplierId} search={search} onChange={onChange} />
      </FoldedOnPhone>
      <p className="text-footnote text-muted-foreground">{sortDescription(search.tab)}</p>
    </div>
  );
}

/**
 * On a phone the period, store, channel and label filters fold behind one "Filtrar" button,
 * so the first order shows right under the search; from `sm` up they always show.
 */
function FoldedOnPhone({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-fit sm:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
      >
        <FunnelSimpleIcon aria-hidden="true" />
        {filterButtonLabel(active)}
      </Button>
      <div id={panelId} className={cn(open ? "block" : "hidden", "sm:block")}>
        {children}
      </div>
    </>
  );
}
