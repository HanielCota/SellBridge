import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { WarningCircleIcon } from "@phosphor-icons/react";
import type { StoreSupplier } from "@sellbridge/database/repositories";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import type { PickableSupplier } from "@/components/onboarding/supplier-picker";
import { AddStore, type NewStoreSupplier } from "@/components/stores/add-store";
import { StoresLockContext } from "@/components/stores/stores-lock";
import {
  DisconnectStoreDialog,
  type StoreToDisconnect,
} from "@/components/stores/disconnect-store-dialog";
import { StoreList, type StoreWithActivity } from "@/components/stores/store-list";
import {
  NewStoreSupplierDialog,
  StoreSupplierDialog,
  type StoreSupplierTarget,
} from "@/components/stores/store-supplier-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  STORE_CONNECT_ERROR_CODES,
  STORE_CONNECT_ERROR_MESSAGES,
} from "@/features/stores/store-connect-errors";
import type { MarketplaceOption } from "@/features/stores/stores.functions";
import { storesQueryOptions } from "@/features/stores/stores.queries";
import { storeSuppliersQueryOptions } from "@/features/stores/store-suppliers.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

/** Codes and ids only: text from the URL is never shown as the app's own message. */
const storesSearchSchema = z.object({
  conectada: optionalParameter(z.uuid()),
  erro: optionalParameter(z.enum(STORE_CONNECT_ERROR_CODES)),
  /** "Vender este fornecedor": the new shop comes with this supplier picked. */
  fornecedor: optionalParameter(z.uuid()),
});

export const Route = createFileRoute("/_app/lojas")({
  validateSearch: storesSearchSchema,
  loader: ({ context }) =>
    Promise.all([
      prefetchOnServer(context.queryClient, storesQueryOptions()),
      prefetchOnServer(context.queryClient, storeSuppliersQueryOptions()),
    ]),
  head: () => ({ meta: [{ title: "Lojas | SellBridge" }] }),
  component: StoresPage,
});

function useOAuthResultToast() {
  const search = Route.useSearch();
  const stores = useQuery(storesQueryOptions());
  const connectedName = stores.data?.stores.find(
    (store) => store.id === search.conectada,
  )?.shopName;
  const navigate = useNavigate({ from: Route.fullPath });
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    if (!search.conectada && !search.erro) {
      return;
    }
    // The store's name comes from the list, not the URL: wait for it before saying it.
    if (search.conectada && stores.isPending) {
      return;
    }
    const key = `${search.conectada ?? ""}|${search.erro ?? ""}`;
    if (shownKey.current === key) {
      return;
    }
    shownKey.current = key;
    if (search.conectada) {
      toast.success(connectedName ? `Loja "${connectedName}" conectada` : "Loja conectada");
    }
    if (search.erro) {
      toast.error(STORE_CONNECT_ERROR_MESSAGES[search.erro]);
    }
    void navigate({ search: {}, replace: true });
  }, [connectedName, navigate, search.conectada, search.erro, stores.isPending]);
}

function StoresPage() {
  useOAuthResultToast();
  const { session } = Route.useRouteContext();
  const isImpersonating = session.impersonatedBy !== null;
  return (
    <StoresLockContext value={isImpersonating}>
      <PageHeader
        title="Lojas"
        description="Suas lojas nos marketplaces, com o que cada uma vendeu nos últimos 30 dias."
      />
      {isImpersonating ? (
        <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
          Conectar e desconectar lojas ficam travados enquanto você usa o app como este cliente.
        </p>
      ) : null}
      <StoresContent />
    </StoresLockContext>
  );
}

const ONBOARDING_STEPS = [
  "Autorize o SellBridge na sua conta do marketplace.",
  "Publique seus próprios produtos e os produtos do fornecedor escolhido para a loja.",
  "Pedidos, estoque e preço passam a ser sincronizados automaticamente.",
] as const;

interface NewStoreChoice {
  supplier: NewStoreSupplier | null;
  onChooseSupplier: () => void;
}

function FirstStoreOnboarding({
  marketplaces,
  choice,
}: {
  marketplaces: MarketplaceOption[];
  choice: NewStoreChoice;
}) {
  return (
    <section
      aria-labelledby="first-store"
      className="surface-card grid gap-8 rounded-3xl bg-card p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:p-8"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Nenhuma loja conectada</p>
          <h2 id="first-store" className="text-3xl leading-tight font-semibold tracking-tight">
            Conecte sua primeira loja
          </h2>
        </div>
        <ol className="space-y-4">
          {ONBOARDING_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand-text">
                {index + 1}
              </span>
              <p className="pt-1 text-sm text-muted-foreground">{step}</p>
            </li>
          ))}
        </ol>
      </div>
      <AddStore
        marketplaces={marketplaces}
        supplier={choice.supplier}
        onChooseSupplier={choice.onChooseSupplier}
      />
    </section>
  );
}

const ADD_STORE_ANCHOR = "adicionar-loja";

/**
 * The list loads after a client navigation, so the router's own hash scroll runs before this
 * section exists; it brings itself into view once mounted when the link pointed at it.
 */
function useScrollIntoViewOnHash(anchor: string) {
  const ref = useRef<HTMLElement>(null);
  const hash = useLocation({ select: (location) => location.hash });
  useEffect(() => {
    if (hash !== anchor) {
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [anchor, hash]);
  return ref;
}

function AddStoreSection({
  marketplaces,
  choice,
}: {
  marketplaces: MarketplaceOption[];
  choice: NewStoreChoice;
}) {
  const ref = useScrollIntoViewOnHash(ADD_STORE_ANCHOR);
  return (
    <section
      ref={ref}
      id={ADD_STORE_ANCHOR}
      aria-labelledby="add-store"
      className="scroll-mt-28 space-y-2 pt-6"
    >
      <h2 id="add-store" className="px-5 text-footnote font-normal text-muted-foreground">
        Adicionar loja
      </h2>
      <AddStore
        marketplaces={marketplaces}
        supplier={choice.supplier}
        onChooseSupplier={choice.onChooseSupplier}
      />
    </section>
  );
}

function toNewStoreSupplier(supplier: StoreSupplier | PickableSupplier): NewStoreSupplier {
  return {
    id: supplier.id,
    name: supplier.name,
    logoUrl: supplier.logoUrl,
    place: `${supplier.niche} · ${supplier.city} - ${supplier.state}`,
  };
}

/**
 * The supplier the next shop sells: the one picked here, else, for a first shop, the one picked
 * during onboarding. Further shops ask, since each one sells a single supplier.
 */
function useNewStoreChoice(hasStores: boolean) {
  const { fornecedor } = Route.useSearch();
  const suppliers = useQuery(storeSuppliersQueryOptions(fornecedor));
  const [picked, setPicked] = useState<NewStoreSupplier | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const starter =
    suppliers.data?.pickedSupplier ?? (hasStores ? null : suppliers.data?.starterSupplier) ?? null;
  const fallback = starter === null ? null : toNewStoreSupplier(starter);
  const choice: NewStoreChoice = {
    supplier: picked ?? fallback,
    onChooseSupplier: () => setIsPicking(true),
  };
  const dialog = (
    <NewStoreSupplierDialog
      open={isPicking}
      currentSupplierId={choice.supplier?.id ?? null}
      onPicked={(supplier) => {
        setPicked(toNewStoreSupplier(supplier));
        setIsPicking(false);
      }}
      onClose={() => setIsPicking(false)}
    />
  );
  return { choice, dialog };
}

function supplierLabels(suppliers: readonly StoreSupplier[] | undefined) {
  return new Map(
    (suppliers ?? []).map((supplier) => [
      supplier.id,
      { name: supplier.name, active: supplier.active },
    ]),
  );
}

/** Shops connected before the one-supplier rule, or whose supplier was deleted, wait for one. */
function PendingSupplierNotice({ stores }: { stores: readonly StoreWithActivity[] }) {
  const pending = stores.filter(
    (store) => store.supplierId === null && store.status !== "disconnected",
  ).length;
  if (pending === 0) {
    return null;
  }
  return (
    <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
      <WarningCircleIcon weight="fill" aria-hidden="true" />
      <AlertDescription className="text-current">
        {pending === 1
          ? "1 loja ainda não tem fornecedor."
          : `${pending.toLocaleString("pt-BR")} lojas ainda não têm fornecedor.`}{" "}
        Escolha um fornecedor para cada loja para publicar os produtos dele. Os anúncios existentes
        continuam vendendo.
      </AlertDescription>
    </Alert>
  );
}

function supplierTargetOf(store: StoreWithActivity): StoreSupplierTarget {
  return { storeId: store.id, storeName: store.shopName, currentSupplierId: store.supplierId };
}

function StoresContent() {
  const query = useQuery(storesQueryOptions());
  const suppliers = useQuery(storeSuppliersQueryOptions());
  const [pendingDisconnect, setPendingDisconnect] = useState<StoreToDisconnect | null>(null);
  const [supplierTarget, setSupplierTarget] = useState<StoreSupplierTarget | null>(null);
  const newStore = useNewStoreChoice((query.data?.stores.length ?? 0) > 0);
  if (query.isPending) {
    return (
      <output className="block space-y-8" aria-busy="true" aria-label="Carregando lojas">
        <Skeleton className="h-20 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </output>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const { stores, marketplaces } = query.data;
  if (stores.length === 0) {
    return (
      <>
        <FirstStoreOnboarding marketplaces={marketplaces} choice={newStore.choice} />
        {newStore.dialog}
      </>
    );
  }
  const labels = new Map(marketplaces.map((option) => [option.id, option.label]));
  return (
    <>
      <section aria-label="Suas lojas" className="space-y-4">
        <PendingSupplierNotice stores={stores} />
        <StoreList
          stores={stores}
          labels={labels}
          suppliers={supplierLabels(suppliers.data?.suppliers)}
          onDisconnect={(store) => setPendingDisconnect({ id: store.id, name: store.shopName })}
          onChangeSupplier={(store) => setSupplierTarget(supplierTargetOf(store))}
        />
      </section>
      <AddStoreSection marketplaces={marketplaces} choice={newStore.choice} />
      <DisconnectStoreDialog store={pendingDisconnect} onClose={() => setPendingDisconnect(null)} />
      <StoreSupplierDialog target={supplierTarget} onClose={() => setSupplierTarget(null)} />
      {newStore.dialog}
    </>
  );
}
