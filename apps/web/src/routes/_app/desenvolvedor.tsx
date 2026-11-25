import { KeyIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CreateDeveloperKeyDialog } from "@/components/developer-api/create-developer-key-dialog";
import { DeveloperKeyList } from "@/components/developer-api/developer-key-list";
import {
  type DeveloperKeyToRevoke,
  RevokeDeveloperKeyDialog,
} from "@/components/developer-api/revoke-developer-key-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDeveloperAccess } from "@/features/developer-api/developer-keys.functions";
import { developerKeysQueryOptions } from "@/features/developer-api/developer-keys.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

/**
 * Hidden page for the SellBridge developers (decision of 25/11/2026): only listed developers see
 * its team-bar tab, and every account outside `DEVELOPER_EMAILS`, admins included, gets
 * "not found".
 */
export const Route = createFileRoute("/_app/desenvolvedor")({
  beforeLoad: async () => {
    const access = await getDeveloperAccess();
    if (!access.allowed) {
      throw notFound();
    }
  },
  loader: ({ context }) => prefetchOnServer(context.queryClient, developerKeysQueryOptions()),
  head: () => ({ meta: [{ title: "Chaves de desenvolvedor | SellBridge" }] }),
  component: DeveloperKeysPage,
});

function DeveloperKeysContent({
  onCreate,
  onRevoke,
}: {
  onCreate: () => void;
  onRevoke: (developerKey: DeveloperKeyToRevoke) => void;
}) {
  const query = useQuery(developerKeysQueryOptions());
  if (query.isPending) {
    return (
      <Skeleton className="h-40 rounded-3xl" aria-busy="true" aria-label="Carregando chaves" />
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={KeyIcon}
        title="Nenhuma chave criada"
        description="Crie uma chave para outro projeto ler os dados do SellBridge de todas as organizações."
        action={
          <Button onClick={onCreate}>
            <PlusIcon aria-hidden="true" />
            Nova chave
          </Button>
        }
      />
    );
  }
  return (
    <DeveloperKeyList
      developerKeys={query.data}
      onRevoke={(developerKey) => onRevoke({ id: developerKey.id, name: developerKey.name })}
    />
  );
}

function DeveloperKeysPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<DeveloperKeyToRevoke | null>(null);
  const keyCount = useQuery(developerKeysQueryOptions()).data?.length ?? 0;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        title="Chaves de desenvolvedor"
        description="Só quem está na lista de desenvolvedores do servidor vê esta página. Cada chave lê, sem mudar nada, os tipos de informação marcados de todas as organizações, e vence na data escolhida."
        actions={
          // With no keys yet, the empty state holds the only "Nova chave" button.
          keyCount === 0 ? undefined : (
            <Button onClick={() => setIsCreating(true)}>
              <PlusIcon aria-hidden="true" />
              Nova chave
            </Button>
          )
        }
      />
      <DeveloperKeysContent onCreate={() => setIsCreating(true)} onRevoke={setPendingRevoke} />
      <CreateDeveloperKeyDialog open={isCreating} onOpenChange={setIsCreating} />
      <RevokeDeveloperKeyDialog
        developerKey={pendingRevoke}
        onClose={() => setPendingRevoke(null)}
      />
    </div>
  );
}
