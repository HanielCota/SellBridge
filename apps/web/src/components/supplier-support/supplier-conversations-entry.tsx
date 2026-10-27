import { StorefrontIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { myUnreadConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";

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
 * The second way out of the support card, a full button under "Abrir chamado" so it is found at a
 * glance: a store reaches the supplier of one of its stores; a supplier, the stores that wrote to it.
 */
export function SupplierConversationsEntry({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Button asChild variant="outline" className="w-full">
      <Link to="/suporte/fornecedores/novo" onClick={onNavigate}>
        <StorefrontIcon aria-hidden="true" />
        Falar com fornecedor
        <UnreadCount />
      </Link>
    </Button>
  );
}
