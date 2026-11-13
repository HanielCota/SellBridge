import {
  SUPPLIER_SALES_SITUATION_LABELS,
  SUPPLIER_SALES_SITUATIONS,
  type SupplierSalesSituation,
} from "@sellbridge/shared/supplier-panel-sales";
import type { PeriodPreset } from "@sellbridge/shared/schemas";
import { PeriodFilters } from "@/components/reports/period-filters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupplierSalesData } from "@/features/supplier-panel/sales/sales.queries";
import type { SupplierSalesSearch } from "@/features/supplier-panel/sales/sales-search";

const ALL_PRODUCTS = "__all__";

/** Today, a week, a month, a year or the supplier's own dates; 90 days and 6 months stay out. */
const SUPPLIER_HOME_PERIODS = [
  "today",
  "7d",
  "30d",
  "365d",
  "custom",
] as const satisfies readonly PeriodPreset[];
const SELECT_CLASS_NAME = "w-full min-w-44 rounded-full sm:w-auto";

function isSituation(value: string): value is SupplierSalesSituation {
  return SUPPLIER_SALES_SITUATIONS.some((situation) => situation === value);
}

function ProductSelect({
  products,
  value,
  onChange,
}: {
  products: SupplierSalesData["productOptions"];
  value: string | undefined;
  onChange: (product: string | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ALL_PRODUCTS}
      onValueChange={(next) => onChange(next === ALL_PRODUCTS ? undefined : next)}
    >
      <SelectTrigger aria-label="Produto" className={SELECT_CLASS_NAME}>
        <SelectValue>
          {products.find((option) => option.id === value)?.title ?? "Todos os produtos"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PRODUCTS}>Todos os produtos</SelectItem>
        {products.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SituationSelect({
  value,
  onChange,
}: {
  value: SupplierSalesSituation;
  onChange: (situation: SupplierSalesSituation) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (isSituation(next)) onChange(next);
      }}
    >
      <SelectTrigger aria-label="Situação dos pedidos" className={SELECT_CLASS_NAME}>
        <SelectValue>{SUPPLIER_SALES_SITUATION_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SUPPLIER_SALES_SITUATIONS.map((situation) => (
          <SelectItem key={situation} value={situation}>
            {SUPPLIER_SALES_SITUATION_LABELS[situation]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The chart card's controls (item 38): the reseller's period, then the product and the
 * situation where the reseller picks a store.
 */
export function SupplierSalesFilters({
  data,
  search,
  onChange,
}: {
  data: SupplierSalesData;
  search: SupplierSalesSearch;
  onChange: (patch: Partial<SupplierSalesSearch>) => void;
}) {
  return (
    <PeriodFilters
      search={search}
      presets={SUPPLIER_HOME_PERIODS}
      resolvedFrom={data.period.fromDate}
      resolvedTo={data.period.toDate}
      onChange={onChange}
      extra={
        <>
          <ProductSelect
            products={data.productOptions}
            value={search.product}
            onChange={(product) => onChange({ product })}
          />
          <SituationSelect
            value={search.situation}
            onChange={(situation) => onChange({ situation })}
          />
        </>
      }
    />
  );
}
