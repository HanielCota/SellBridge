import { CheckCircleIcon, MapPinIcon, PackageIcon, StorefrontIcon } from "@phosphor-icons/react";
import { stateSchema } from "@sellbridge/shared/brazilian-states";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { SearchInput } from "@/components/data/search-input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { ReputationSummary } from "@/components/suppliers/reputation";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { listSuppliers } from "@/features/suppliers/suppliers.functions";
import { suppliersQueryOptions } from "@/features/suppliers/suppliers.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export type PickableSupplier = Awaited<ReturnType<typeof listSuppliers>>["suppliers"][number];

const ALL_STATES = "__all__";
const SEARCH_DELAY_MILLISECONDS = 300;

function useSupplierOptions(term: string, state: string) {
  const query = useDebouncedValue(term.trim(), SEARCH_DELAY_MILLISECONDS);
  const parsedState = stateSchema.safeParse(state);
  return useQuery({
    ...suppliersQueryOptions({
      query: query.length > 0 ? query : undefined,
      state: parsedState.success ? parsedState.data : undefined,
      sort: "reputation",
    }),
    placeholderData: keepPreviousData,
  });
}

/**
 * Picks one supplier from anywhere in Brazil: search by name, niche or product, narrow by state,
 * and choose a card. The cards are radio buttons, so arrows and space work as in any choice list.
 */
export function SupplierPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (supplier: PickableSupplier) => void;
}) {
  const [term, setTerm] = useState("");
  const [state, setState] = useState(ALL_STATES);
  const query = useSupplierOptions(term, state);
  const shown = query.data?.suppliers ?? [];
  // Only states with active suppliers, so the filter never offers an empty one.
  const states = (query.data?.locations ?? []).map((location) => location.state);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput
          label="Buscar fornecedor por nome, nicho ou produto"
          placeholder="Nome, nicho ou produto"
          className="flex-1"
          value={term}
          onValueChange={setTerm}
        />
        <StateSelect states={states} value={state} onChange={setState} />
      </div>
      <SupplierOptions
        query={query}
        suppliers={shown}
        value={value}
        onChange={onChange}
        isFiltered={term.trim().length > 0 || state !== ALL_STATES}
      />
    </div>
  );
}

function StateSelect({
  states,
  value,
  onChange,
}: {
  states: readonly string[];
  value: string;
  onChange: (state: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="justify-start sm:w-48 [&>svg:last-child]:ml-auto"
        aria-label="Estado do fornecedor"
      >
        <MapPinIcon aria-hidden="true" />
        <SelectValue>{value === ALL_STATES ? "Todo o Brasil" : value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_STATES}>Todo o Brasil</SelectItem>
        {states.map((state) => (
          <SelectItem key={state} value={state}>
            {state}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SupplierOptions({
  query,
  suppliers,
  value,
  onChange,
  isFiltered,
}: {
  query: ReturnType<typeof useSupplierOptions>;
  suppliers: readonly PickableSupplier[];
  value: string | null;
  onChange: (supplier: PickableSupplier) => void;
  isFiltered: boolean;
}) {
  const name = useId();
  if (query.isPending) {
    return <SupplierOptionsSkeleton />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={StorefrontIcon}
        title="Nenhum fornecedor encontrado"
        description={
          isFiltered ? "Tente outro nome, nicho ou estado." : "Ainda não há fornecedores ativos."
        }
      />
    );
  }
  return (
    <div
      role="radiogroup"
      aria-label="Fornecedores"
      aria-busy={query.isFetching}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {suppliers.map((supplier) => (
        <SupplierOption
          key={supplier.id}
          name={name}
          supplier={supplier}
          checked={supplier.id === value}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function SupplierOption({
  name,
  supplier,
  checked,
  onChange,
}: {
  name: string;
  supplier: PickableSupplier;
  checked: boolean;
  onChange: (supplier: PickableSupplier) => void;
}) {
  return (
    <label
      className={cn(
        "surface-card relative flex cursor-pointer flex-col gap-3 rounded-3xl bg-card p-4 transition-[box-shadow,transform] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100",
        "has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-ring/30",
        checked ? "ring-2 ring-brand" : "hover:ring-1 hover:ring-border",
      )}
    >
      <input
        type="radio"
        name={name}
        value={supplier.id}
        checked={checked}
        onChange={() => onChange(supplier)}
        className="sr-only"
      />
      <span className="flex items-start gap-3">
        <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block truncate text-sm font-semibold">{supplier.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {supplier.niche} · {supplier.city} - {supplier.state}
          </span>
        </span>
        <CheckCircleIcon
          weight="fill"
          aria-hidden="true"
          className={cn(
            "size-5 shrink-0 text-brand-text transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            checked ? "scale-100 opacity-100" : "scale-75 opacity-0",
          )}
        />
      </span>
      <ReputationSummary reputation={supplier.reputation} />
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <PackageIcon className="size-3.5" aria-hidden="true" />
        {supplier.productCount} produtos
      </span>
    </label>
  );
}

function SupplierOptionsSkeleton() {
  return (
    <output
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      aria-busy="true"
      aria-label="Carregando fornecedores"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-40 rounded-3xl" />
      ))}
    </output>
  );
}
