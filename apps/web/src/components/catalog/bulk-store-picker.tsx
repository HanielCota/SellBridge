import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { displayStoreName } from "@/features/stores/store-name";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { pluralize, SettingsGroup } from "./bulk-publish-parts";

export interface PublishStore {
  id: string;
  shopName: string;
  marketplace: string;
  /** Each store sells a single supplier; null while the seller has not picked one. */
  supplierId: string | null;
}

/** Own products fit every store; external products must share its selected supplier. */
export function storesForProducts(
  products: readonly Pick<SellableCatalogProduct, "catalogKind" | "supplierId">[],
  stores: readonly PublishStore[],
): PublishStore[] {
  if (products.length === 0) return [];
  const supplierIds = new Set(
    products
      .filter((product) => product.catalogKind !== "seller")
      .map((product) => product.supplierId),
  );
  if (supplierIds.size === 0) return [...stores];
  const [only] = supplierIds;
  if (supplierIds.size !== 1 || only === undefined) {
    return [];
  }
  return stores.filter((store) => store.supplierId === only);
}

/** "Loja Lote" when one store is on, "3 de 5 lojas" otherwise. */
function storeSummary(chosen: PublishStore[], stores: PublishStore[]): string {
  const [only] = chosen;
  if (chosen.length === 1 && only) {
    return displayStoreName(only.shopName);
  }
  if (chosen.length === 0) {
    return "Nenhuma loja escolhida";
  }
  return `${chosen.length} de ${pluralize(stores.length, "loja", "lojas")}`;
}

export function StorePicker({
  stores,
  selected,
  onChange,
}: {
  stores: PublishStore[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const chosen = stores.filter((store) => selected.has(store.id));
  const toggle = (storeId: string, on: boolean) => {
    const next = new Set(selected);
    if (on) {
      next.add(storeId);
    }
    if (!on) {
      next.delete(storeId);
    }
    onChange(next);
  };
  return (
    <SettingsGroup title="Onde publicar">
      <StoreSummaryRow
        chosen={chosen}
        stores={stores}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      />
      {expanded
        ? stores.map((store) => (
            <StoreSwitchRow
              key={store.id}
              store={store}
              checked={selected.has(store.id)}
              onCheckedChange={(on) => toggle(store.id, on)}
            />
          ))
        : null}
    </SettingsGroup>
  );
}

/** Collapsed view of the store choice: stacked logos, a count and the toggle. */
function StoreSummaryRow({
  chosen,
  stores,
  expanded,
  onToggle,
}: {
  chosen: PublishStore[];
  stores: PublishStore[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
    >
      <span className="flex shrink-0" aria-hidden="true">
        {chosen.slice(0, 3).map((store) => (
          <MarketplaceMark
            key={store.id}
            marketplace={store.marketplace}
            className="-ml-2 size-7 rounded-lg ring-2 ring-popover first:ml-0"
          />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{storeSummary(chosen, stores)}</span>
      <span className="flex items-center gap-1 text-sm font-medium text-brand-text">
        {expanded ? "Fechar" : "Escolher"}
        <CaretDownIcon
          className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

function StoreSwitchRow({
  store,
  checked,
  onCheckedChange,
}: {
  store: PublishStore;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted">
      <MarketplaceMark marketplace={store.marketplace} className="size-8 rounded-lg" />
      <span className="min-w-0 flex-1 truncate text-sm">{displayStoreName(store.shopName)}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
