import { KeyIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { ApiKeyList } from "@/components/integrations/api-key-list";
import { CreateApiKeyDialog } from "@/components/integrations/create-api-key-dialog";
import { IntegrationsSection } from "@/components/integrations/integrations-layout";
import {
  type ApiKeyToRevoke,
  RevokeApiKeyDialog,
} from "@/components/integrations/revoke-api-key-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiKeysQueryOptions } from "@/features/public-api/api-keys.queries";
import { errorMessage } from "@/lib/errors";

function ApiKeysContent({
  onCreate,
  onRevoke,
}: {
  onCreate: () => void;
  onRevoke: (apiKey: ApiKeyToRevoke) => void;
}) {
  const query = useQuery(apiKeysQueryOptions());
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
        description="Crie uma chave para que seu ERP, planilha ou sistema próprio acesse os dados da sua conta."
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
    <ApiKeyList
      apiKeys={query.data}
      onRevoke={(apiKey) => onRevoke({ id: apiKey.id, name: apiKey.name })}
    />
  );
}

/** The organization's API keys: list, create (secret shown once) and revoke. */
export function ApiKeysSection() {
  const [isCreating, setIsCreating] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyToRevoke | null>(null);
  return (
    <IntegrationsSection
      id="chaves-de-api"
      title="Chaves de API"
      description="Cada chave dá acesso aos dados desta organização com as permissões escolhidas. Use uma chave por integração."
      action={
        <Button variant="outline" size="sm" onClick={() => setIsCreating(true)}>
          <PlusIcon aria-hidden="true" />
          Nova chave
        </Button>
      }
    >
      <ApiKeysContent onCreate={() => setIsCreating(true)} onRevoke={setPendingRevoke} />
      <CreateApiKeyDialog open={isCreating} onOpenChange={setIsCreating} />
      <RevokeApiKeyDialog apiKey={pendingRevoke} onClose={() => setPendingRevoke(null)} />
    </IntegrationsSection>
  );
}
