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

/** With 2 or more stores the reseller picks whose supplier the catalog shows (MVP function 1). */
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

/** One line under the title: whose products these are, and for which store. */
export function catalogDescription(
  scope: CatalogScope,
  supplierName: string | null,
  storeName: string | null,
): string {
  if (supplierName === null) {
    return "Cada loja vende os produtos de um fornecedor.";
  }
  if (scope.kind === "store" && storeName !== null) {
    return `Produtos de ${supplierName} para a loja ${storeName}. Selecione vários para publicar de uma vez.`;
  }
  return `Produtos de ${supplierName}, o fornecedor que você escolheu. Selecione vários para publicar de uma vez.`;
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
    "Os produtos dele não podem ser vendidos agora. Escolha outro fornecedor para esta loja na página Lojas.",
  storeWithoutSupplier:
    "Escolha o fornecedor desta loja na página Lojas. Depois os produtos dele aparecem aqui.",
} as const;

/**
 * The catalog has no supplier to show: a store without one, or an account that has neither a
 * store nor a starter supplier. Never another supplier's products in its place.
 */
export function NoSupplierState({
  scope,
  pausedSupplierName,
}: {
  scope: CatalogScope;
  /** The store's supplier was deactivated by the platform. */
  pausedSupplierName: string | null;
}) {
  if (pausedSupplierName !== null) {
    return (
      <EmptyState
        icon={StorefrontIcon}
        title={`${pausedSupplierName} está pausado`}
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
      description="O fornecedor guarda o estoque e envia os produtos aos seus clientes."
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
