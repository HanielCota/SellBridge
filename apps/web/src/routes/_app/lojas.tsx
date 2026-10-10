import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AddStore } from "@/components/stores/add-store";
import { StoreCard } from "@/components/stores/store-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { disconnectStoreFn, type MarketplaceOption } from "@/features/stores/stores.functions";
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
  const query = useQuery(storesQueryOptions());
  const hasStores = query.isSuccess && query.data.stores.length > 0;
  return (
    <>
      <PageHeader
        title="Lojas"
        description="Suas lojas nos marketplaces, com o que cada uma vendeu nos últimos 30 dias."
        actions={
          hasStores ? (
            <Button asChild>
              <a href="#adicionar-loja">
                <PlusIcon aria-hidden="true" />
                Conectar loja
              </a>
            </Button>
          ) : null
        }
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

function StoresContent() {
  const query = useQuery(storesQueryOptions());
  const [pendingDisconnect, setPendingDisconnect] = useState<{ id: string; name: string } | null>(
    null,
  );
  if (query.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando lojas">
        <Skeleton className="h-64 rounded-3xl" />
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
        <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {stores.map((store) => (
            <li key={store.id}>
              <StoreCard
                store={store}
                marketplaceLabel={labels.get(store.marketplace) ?? store.marketplace}
                onDisconnect={() => setPendingDisconnect({ id: store.id, name: store.shopName })}
              />
            </li>
          ))}
        </ul>
      </section>
      <section
        id="adicionar-loja"
        aria-labelledby="add-store"
        className="scroll-mt-28 space-y-4 pt-4 lg:w-[calc(50%-0.5rem)]"
      >
        <h2 id="add-store" className="text-lg font-semibold tracking-tight">
          Adicionar loja
        </h2>
        <AddStore marketplaces={marketplaces} />
      </section>
      <DisconnectDialog store={pendingDisconnect} onClose={() => setPendingDisconnect(null)} />
    </>
  );
}

function DisconnectDialog({
  store,
  onClose,
}: {
  store: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (storeConnectionId: string) => disconnectStoreFn({ data: { storeConnectionId } }),
    onSuccess: async () => {
      toast.success("Loja desconectada");
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={store !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconectar {store?.name ?? "loja"}?</DialogTitle>
          <DialogDescription>
            Os anúncios já publicados continuam no marketplace, mas o SellBridge deixa de
            sincronizar estoque, preço e pedidos desta loja.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || store === null}
            onClick={() => {
              if (!store) {
                return;
              }
              mutation.mutate(store.id);
            }}
          >
            {mutation.isPending ? "Desconectando..." : "Desconectar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
