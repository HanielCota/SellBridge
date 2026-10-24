import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { SupplierConversationsSearch } from "@sellbridge/shared/schemas";
import {
  CONVERSATION_STATUS_LABELS,
  type ConversationSide,
} from "@sellbridge/shared/supplier-conversation-topics";
import { ChatsCircleIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SearchInput } from "@/components/data/search-input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { ConversationTable } from "@/components/supplier-support/conversation-list";
import {
  conversationsLabel,
  SupportAreaTabs,
} from "@/components/supplier-support/support-area-tabs";
import { TicketStatusFilter } from "@/components/support/ticket-status-filter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { myConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";

const DESCRIPTIONS: Record<ProfileKind, string> = {
  seller:
    "Fale com o fornecedor de cada loja sobre pedidos, trocas, estoque e produtos. A conversa fica toda aqui.",
  supplier:
    "Mensagens das lojas que vendem seus produtos. Responda por aqui: telefone, e-mail e redes sociais não podem ser enviados.",
};

function NewConversationButton() {
  return (
    <Button asChild>
      <Link to="/suporte/fornecedores/novo">
        <PlusIcon aria-hidden="true" />
        Falar com um fornecedor
      </Link>
    </Button>
  );
}

function NoConversations({ kind, isFiltered }: { kind: ProfileKind; isFiltered: boolean }) {
  if (isFiltered) {
    return (
      <EmptyState
        icon={ChatsCircleIcon}
        title="Nenhuma conversa encontrada"
        description="Ajuste a busca ou o status."
      />
    );
  }
  if (kind === "supplier") {
    return (
      <EmptyState
        icon={ChatsCircleIcon}
        title="Nenhuma mensagem de revendedor ainda"
        description="Quando uma loja que vende seus produtos escrever, a conversa aparece aqui e você recebe um aviso."
      />
    );
  }
  return (
    <EmptyState
      icon={ChatsCircleIcon}
      title="Você ainda não falou com fornecedores"
      description="Escolha a loja, o assunto e escreva. O fornecedor responde por aqui."
    />
  );
}

function ConversationFilters({
  search,
  side,
  onChange,
}: {
  search: SupplierConversationsSearch;
  side: ConversationSide;
  onChange: (patch: Partial<SupplierConversationsSearch>) => void;
}) {
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => onChange({ query }),
  });
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchInput
        label="Buscar conversas"
        placeholder="Buscar pelo assunto ou pela loja"
        className="flex-1"
        value={term}
        onValueChange={setTerm}
      />
      <TicketStatusFilter
        labels={CONVERSATION_STATUS_LABELS[side]}
        value={search.status}
        onChange={(status) => onChange({ status })}
      />
    </div>
  );
}

function ConversationResults({
  kind,
  search,
  onChange,
}: {
  kind: ProfileKind;
  search: SupplierConversationsSearch;
  onChange: (patch: Partial<SupplierConversationsSearch>) => void;
}) {
  const query = useQuery(myConversationsQueryOptions(search));
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" aria-label="Carregando conversas" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const isFiltered = search.status !== undefined || search.query !== undefined;
  const isEmpty = query.data.items.length === 0;
  return (
    <>
      {isEmpty && !isFiltered ? null : (
        <ConversationFilters search={search} side={query.data.side} onChange={onChange} />
      )}
      {isEmpty ? (
        <NoConversations kind={kind} isFiltered={isFiltered} />
      ) : (
        <ConversationTable
          side={query.data.side}
          page={query.data}
          onPageChange={(page) => onChange({ page })}
        />
      )}
    </>
  );
}

/** "Fornecedores" for a store, "Revendedores" for a supplier: the same inbox, per side. */
export function ConversationsPage({
  kind,
  search,
  onSearchChange,
}: {
  kind: ProfileKind;
  search: SupplierConversationsSearch;
  onSearchChange: (patch: Partial<SupplierConversationsSearch>) => void;
}) {
  return (
    <>
      <PageHeader
        title="Suporte"
        description={DESCRIPTIONS[kind]}
        actions={kind === "seller" ? <NewConversationButton /> : null}
      />
      <SupportAreaTabs current="conversations" kind={kind} />
      <h2 className="sr-only">{conversationsLabel(kind)}</h2>
      <ConversationResults kind={kind} search={search} onChange={onSearchChange} />
    </>
  );
}
