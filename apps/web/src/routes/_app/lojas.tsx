import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plug, Store, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { StoreStatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { disconnectStoreFn } from "@/features/stores/stores.functions";
import { storesQueryOptions } from "@/features/stores/stores.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const storesSearchSchema = z.object({
  conectada: z.string().optional().catch(undefined),
  erro: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/lojas")({
  validateSearch: storesSearchSchema,
  loader: ({ context }) => prefetchOnServer(context.queryClient, storesQueryOptions()),
  head: () => ({ meta: [{ title: "Lojas conectadas | SellBridge" }] }),
  component: StoresPage,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

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
      toast.success(`Loja "${search.conectada}" conectada com sucesso`);
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
        title="Lojas conectadas"
        description="Conecte suas lojas nos marketplaces para publicar produtos e receber pedidos."
      />
      <ConnectedStores />
      <MarketplaceOptions />
    </>
  );
}

function ConnectedStores() {
  const query = useQuery(storesQueryOptions());
  const [pendingDisconnect, setPendingDisconnect] = useState<{ id: string; name: string } | null>(
    null,
  );

  if (query.isPending) {
    return (
      <div className="grid gap-3" aria-busy="true" aria-label="Carregando lojas">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.stores.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Nenhuma loja conectada"
        description="Conecte sua primeira loja abaixo para começar a publicar produtos."
      />
    );
  }

  const labels = new Map(query.data.marketplaces.map((option) => [option.id, option.label]));
  return (
    <section aria-labelledby="connected-stores" className="space-y-3">
      <h2 id="connected-stores" className="text-sm font-medium text-muted-foreground">
        Suas lojas
      </h2>
      <ul className="grid gap-3">
        {query.data.stores.map((store) => (
          <li key={store.id}>
            <Card className="py-4">
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{store.shopName}</span>
                    <StoreStatusBadge status={store.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {labels.get(store.marketplace) ?? store.marketplace} · conectada em{" "}
                    {dateFormatter.format(store.connectedAt)}
                    {store.expiresAt
                      ? ` · acesso válido até ${dateFormatter.format(store.expiresAt)}`
                      : ""}
                  </p>
                  {store.lastError ? (
                    <p className="text-xs text-destructive">{store.lastError}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {store.status === "connected" ? null : (
                    <Button asChild size="sm">
                      <a href={`/api/oauth/${store.marketplace}/start`}>
                        <Plug aria-hidden="true" />
                        Reconectar
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingDisconnect({ id: store.id, name: store.shopName })}
                  >
                    <Unplug aria-hidden="true" />
                    Desconectar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <DisconnectDialog store={pendingDisconnect} onClose={() => setPendingDisconnect(null)} />
    </section>
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

function MarketplaceOptions() {
  const query = useQuery(storesQueryOptions());
  if (!query.isSuccess) {
    return null;
  }
  return (
    <section aria-labelledby="connect-new" className="space-y-3">
      <h2 id="connect-new" className="text-sm font-medium text-muted-foreground">
        Conectar nova loja
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {query.data.marketplaces.map((option) => (
          <li key={option.id}>
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{option.label}</CardTitle>
                  {option.available ? null : <Badge variant="secondary">Em breve</Badge>}
                </div>
                <CardDescription>
                  {option.id === "mock"
                    ? "Marketplace simulado para testar o fluxo completo sem uma conta real."
                    : `Conecte sua loja ${option.label} via autorização oficial.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                {option.available ? (
                  <Button asChild className="w-full">
                    <a href={`/api/oauth/${option.id}/start`}>Conectar {option.label}</a>
                  </Button>
                ) : (
                  <Button className="w-full" disabled>
                    Indisponível
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
