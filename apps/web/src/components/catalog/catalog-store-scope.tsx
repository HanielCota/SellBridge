import type { CatalogScope } from "@sellbridge/shared/catalog-scope";
import { StorefrontIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** A store the catalog can follow; the server already left out disconnected ones. */
export interface ScopeStoreOption {
  id: string;
  shopName: string;
  marketplaceLabel: string;
  hasSupplier: boolean;
}

/** How a store reads in the picker: its marketplace, and a note while it has no supplier. */
export function storeOptionLabel(
  store: Pick<ScopeStoreOption, "shopName" | "marketplaceLabel" | "hasSupplier">,
): { name: string; note: string | null } {
  return {
    name: `${store.shopName} · ${store.marketplaceLabel}`,
    note: store.hasSupplier ? null : "sem fornecedor",
  };
}

function StoreOptionText({ store }: { store: ScopeStoreOption }) {
  const label = storeOptionLabel(store);
  return (
    <>
      {label.name}
      {label.note === null ? null : (
        <span className="ml-1 text-muted-foreground">({label.note})</span>
      )}
    </>
  );
}

/** With 2 or more stores the reseller picks whose suppliers the catalog shows (MVP function 1). */
export function CatalogStorePicker({
  stores,
  value,
  onChange,
}: {
  stores: readonly ScopeStoreOption[];
  value: string | null;
  onChange: (storeId: string) => void;
}) {
  if (stores.length < 2 || value === null) {
    return null;
  }
  const current = stores.find((store) => store.id === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-auto sm:min-w-56" aria-label="Loja">
        {/* Icon and name together on the left; the trigger spreads its children apart. */}
        <SelectValue>
          <StorefrontIcon aria-hidden="true" />
          {current ? <StoreOptionText store={current} /> : "Loja"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            <StoreOptionText store={store} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const NAME_LIST_FORMAT = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

/** One line under the title: whose products these are, and for which store. */
export function catalogDescription(
  scope: CatalogScope,
  supplierNames: readonly string[],
  storeName: string | null,
): string {
  if (supplierNames.length === 0) {
    return "Cada loja vende os produtos dos fornecedores escolhidos para ela.";
  }
  const names = NAME_LIST_FORMAT.format(supplierNames);
  if (scope.kind === "store" && storeName !== null) {
    return `Produtos de ${names} para a loja ${storeName}. Marque vários para publicar de uma vez.`;
  }
  return `Produtos de ${names}, o fornecedor que você escolheu. Marque vários para publicar de uma vez.`;
}

/** "X está pausado" or "X e Y estão pausados", for the suppliers the platform deactivated. */
export function pausedTitle(names: readonly string[]): string {
  const verb = names.length === 1 ? "está pausado" : "estão pausados";
  return `${NAME_LIST_FORMAT.format(names)} ${verb}`;
}

/** Some of the store's suppliers are paused: their products are missing from the list below. */
export function PausedSuppliersNotice({ names }: { names: readonly string[] }) {
  if (names.length === 0) {
    return null;
  }
  const whose = names.length === 1 ? "dele" : "deles";
  return (
    <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <WarningCircleIcon weight="fill" aria-hidden="true" />
      <AlertDescription className="text-current">
        {pausedTitle(names)}: os produtos {whose} não aparecem agora. Os outros fornecedores da loja
        continuam iguais.
      </AlertDescription>
    </Alert>
  );
}

/** No store yet: the starter supplier's products show, with the next step to sell them. */
export function NoStoreNotice() {
  return (
    <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <WarningCircleIcon weight="fill" aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2 text-current">
        <span>Para publicar estes produtos, conecte uma loja primeiro.</span>
        <Link to="/lojas" className="font-medium underline underline-offset-4">
          Conectar loja
        </Link>
      </AlertDescription>
    </Alert>
  );
}

/** What the empty catalog says; the button below each one leads to the page it names. */
export const NO_SUPPLIER_TEXTS = {
  paused:
    "Os produtos não podem ser vendidos agora. Adicione outro fornecedor a esta loja na página Lojas.",
  storeWithoutSupplier:
    "Escolha o fornecedor desta loja na página Lojas. Depois os produtos dele aparecem aqui.",
} as const;

/**
 * The catalog has no supplier to show: a store without one or with all of them paused, or an
 * account that has neither a
 * store nor a starter supplier. Never another supplier's products in its place.
 */
export function NoSupplierState({
  scope,
  pausedSupplierNames,
}: {
  scope: CatalogScope;
  /** The store's suppliers, all deactivated by the platform. */
  pausedSupplierNames: readonly string[];
}) {
  if (pausedSupplierNames.length > 0) {
    return (
      <EmptyState
        icon={StorefrontIcon}
        title={pausedTitle(pausedSupplierNames)}
        description={NO_SUPPLIER_TEXTS.paused}
        action={
          <Button asChild>
            <Link to="/lojas">Ir para Lojas</Link>
          </Button>
        }
      />
    );
  }
  if (scope.kind === "store") {
    return (
      <EmptyState
        icon={StorefrontIcon}
        title="Esta loja ainda não tem fornecedor"
        description={NO_SUPPLIER_TEXTS.storeWithoutSupplier}
        action={
          <Button asChild>
            <Link to="/lojas">Ir para Lojas</Link>
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={StorefrontIcon}
      title="Escolha um fornecedor para ver os produtos"
      description="O fornecedor guarda o estoque e envia os produtos aos seus compradores."
      action={
        <Button asChild>
          <Link to="/onboarding" search={{ step: "supplier" }}>
            Escolher fornecedor
          </Link>
        </Button>
      }
    />
  );
}
