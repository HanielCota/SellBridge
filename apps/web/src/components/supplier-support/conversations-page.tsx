import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { SupplierConversationsSearch, TicketStatus } from "@sellbridge/shared/schemas";
import {
  CONVERSATION_STATUS_LABELS,
  type ConversationSide,
} from "@sellbridge/shared/supplier-conversation-topics";
import { ChatsCircleIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FilterTabs } from "@/components/data/filter-tabs";
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
        description="Ajuste a busca ou a situação."
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

type ConversationCounts = Record<TicketStatus, number>;

/** The supplier's queue, in the order the work moves: what waits for it, then the rest. */
const QUEUE_TABS: readonly TicketStatus[] = ["open", "answered", "closed"];

const EMPTY_TABS: Record<TicketStatus, { title: string; description: string }> = {
  open: {
    title: "Nada a fazer agora",
    description: "Quando uma loja escrever ou responder, a conversa aparece aqui.",
  },
  answered: {
    title: "Nenhuma conversa em andamento",
    description: "Aqui ficam as conversas que você respondeu e que esperam a loja.",
  },
  closed: {
    title: "Nenhuma conversa finalizada",
    description: "As conversas que você ou a loja finalizarem ficam guardadas aqui.",
  },
};

function SearchField({
  search,
  placeholder,
  onChange,
}: {
  search: SupplierConversationsSearch;
  placeholder: string;
  onChange: (patch: Partial<SupplierConversationsSearch>) => void;
}) {
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => onChange({ query }),
  });
  return (
    <SearchInput
      label="Buscar conversas"
      placeholder={placeholder}
      className="flex-1"
      value={term}
      onValueChange={setTerm}
    />
  );
}

function ResellerFilters({
  search,
  onChange,
}: {
  search: SupplierConversationsSearch;
  onChange: (patch: Partial<SupplierConversationsSearch>) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchField
        search={search}
        placeholder="Buscar pelo assunto, pela loja ou pelo pedido"
        onChange={onChange}
      />
      <TicketStatusFilter
        labels={CONVERSATION_STATUS_LABELS.reseller}
        value={search.status}
        onChange={(status) => onChange({ status })}
      />
    </div>
  );
}

/** A Fazer, Em andamento and Finalizado, each with how many conversations it holds. */
function SupplierQueueFilters({
  search,
  counts,
  onChange,
}: {
  search: SupplierConversationsSearch;
  counts: ConversationCounts;
  onChange: (patch: Partial<SupplierConversationsSearch>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <FilterTabs
        legend="Situação das conversas"
        value={search.status ?? "open"}
        tabs={QUEUE_TABS.map((status) => ({
          value: status,
          label: CONVERSATION_STATUS_LABELS.supplier[status],
          count: counts[status],
        }))}
        onChange={(status) => onChange({ status })}
      />
      <SearchField
        search={search}
        placeholder="Buscar pelo assunto, pela loja ou pelo número do pedido"
        onChange={onChange}
      />
    </div>
  );
}

function ConversationFilters({
  search,
  side,
  counts,
  onChange,
}: {
  search: SupplierConversationsSearch;
  side: ConversationSide;
  counts: ConversationCounts;
  onChange: (patch: Partial<SupplierConversationsSearch>) => void;
}) {
  if (side === "supplier") {
    return <SupplierQueueFilters search={search} counts={counts} onChange={onChange} />;
  }
  return <ResellerFilters search={search} onChange={onChange} />;
}

function totalOf(counts: ConversationCounts): number {
  return counts.open + counts.answered + counts.closed;
}

function EmptyResults({
  kind,
  side,
  search,
}: {
  kind: ProfileKind;
  side: ConversationSide;
  search: SupplierConversationsSearch;
}) {
  if (side === "supplier" && search.query === undefined) {
    const empty = EMPTY_TABS[search.status ?? "open"];
    return (
      <EmptyState icon={ChatsCircleIcon} title={empty.title} description={empty.description} />
    );
  }
  return <NoConversations kind={kind} isFiltered />;
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
  const { side, counts } = query.data;
  const hasNoSearch = search.query === undefined;
  // A supplier's tab may be empty while others are not: only an empty inbox gets the welcome.
  const hasNone =
    side === "supplier"
      ? totalOf(counts) === 0 && hasNoSearch
      : query.data.items.length === 0 && search.status === undefined && hasNoSearch;
  if (hasNone) {
    return <NoConversations kind={kind} isFiltered={false} />;
  }
  return (
    <>
      <ConversationFilters search={search} side={side} counts={counts} onChange={onChange} />
      {query.data.items.length === 0 ? (
        <EmptyResults kind={kind} side={side} search={search} />
      ) : (
        <ConversationTable
          side={side}
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
