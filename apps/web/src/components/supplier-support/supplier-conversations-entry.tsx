import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { CaretRightIcon, StorefrontIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { myUnreadConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";

const ENTRY_COPY: Record<ProfileKind, { title: string; legend: string }> = {
  seller: {
    title: "Falar com um fornecedor",
    legend: "Pedidos, trocas e estoque com o fornecedor da sua loja",
  },
  supplier: {
    title: "Mensagens de revendedores",
    legend: "As lojas que vendem seus produtos escrevem aqui",
  },
};

/** Loaded only while the support card is open, like the recent tickets under it. */
function UnreadCount() {
  const query = useQuery(myUnreadConversationsQueryOptions());
  if (query.data === undefined || query.data === 0) {
    return null;
  }
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-caption font-semibold text-primary-foreground tabular-nums">
      <span className="sr-only">Não lidas: </span>
      {query.data > 9 ? "9+" : query.data}
    </span>
  );
}

/**
 * The second way out of the support card, apart from the team's tickets: a store reaches the
 * supplier of one of its stores; a supplier, the stores that wrote to it.
 */
export function SupplierConversationsEntry({
  kind,
  onNavigate,
}: {
  kind: ProfileKind;
  onNavigate: () => void;
}) {
  const copy = ENTRY_COPY[kind];
  return (
    <div className="border-t pt-2">
      <Link
        to={kind === "seller" ? "/suporte/fornecedores/novo" : "/suporte/revendedores"}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
      >
        <StorefrontIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block text-sm font-medium">{copy.title}</span>
          <span className="block text-xs text-muted-foreground">{copy.legend}</span>
        </span>
        <UnreadCount />
        <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </div>
  );
}
