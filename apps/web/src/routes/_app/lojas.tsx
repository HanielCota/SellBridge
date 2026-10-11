import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { AddStore } from "@/components/stores/add-store";
import {
  DisconnectStoreDialog,
  type StoreToDisconnect,
} from "@/components/stores/disconnect-store-dialog";
import { StoreList } from "@/components/stores/store-list";
import { Skeleton } from "@/components/ui/skeleton";
import type { MarketplaceOption } from "@/features/stores/stores.functions";
import { storesQueryOptions } from "@/features/stores/stores.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const storesSearchSchema = z.object({
  conectada: optionalParameter(z.string()),
  erro: optionalParameter(z.string()),
});

export const Route = createFileRoute("/_app/lojas")({
  validateSearch: storesSearchSchema,
  loader: ({ context }) => prefetchOnServer(context.queryClient, storesQueryOptions()),
  head: () => ({ meta: [{ title: "Lojas | SellBridge" }] }),
  component: StoresPage,
});

function useOAuthResultToast() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    if (!search.conectada && !search.erro) {
      return;
    }
    const key = `${search.conectada ?? ""}|${search.erro ?? ""}`;
    if (shownKey.current === key) {
      return;
    }
    shownKey.current = key;
    if (search.conectada) {
      toast.success(`Loja "${search.conectada}" conectada`);
    }
    if (search.erro) {
      toast.error(search.erro);
    }
    void navigate({ search: {}, replace: true });
  }, [navigate, search.conectada, search.erro]);
}

function StoresPage() {
  useOAuthResultToast();
  return (
    <>
      <PageHeader
        title="Lojas"
        description="Suas lojas nos marketplaces, com o que cada uma vendeu nos últimos 30 dias."
      />
      <StoresContent />
    </>
  );
}

const ONBOARDING_STEPS = [
  "Autorize o SellBridge na sua conta do marketplace.",
  "Escolha produtos dos fornecedores e publique na loja.",
  "Pedidos, estoque e preço passam a ser sincronizados automaticamente.",
] as const;

function FirstStoreOnboarding({ marketplaces }: { marketplaces: MarketplaceOption[] }) {
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
      <AddStore marketplaces={marketplaces} />
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

function AddStoreSection({ marketplaces }: { marketplaces: MarketplaceOption[] }) {
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
      <AddStore marketplaces={marketplaces} />
    </section>
  );
}

function StoresContent() {
  const query = useQuery(storesQueryOptions());
  const [pendingDisconnect, setPendingDisconnect] = useState<StoreToDisconnect | null>(null);
  if (query.isPending) {
    return (
      <div className="space-y-8" aria-busy="true" aria-label="Carregando lojas">
        <Skeleton className="h-20 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const { stores, marketplaces } = query.data;
  if (stores.length === 0) {
    return <FirstStoreOnboarding marketplaces={marketplaces} />;
  }
  const labels = new Map(marketplaces.map((option) => [option.id, option.label]));
  return (
    <>
      <section aria-label="Suas lojas">
        <StoreList
          stores={stores}
          labels={labels}
          onDisconnect={(store) => setPendingDisconnect({ id: store.id, name: store.shopName })}
        />
      </section>
      <AddStoreSection marketplaces={marketplaces} />
      <DisconnectStoreDialog store={pendingDisconnect} onClose={() => setPendingDisconnect(null)} />
    </>
  );
}
