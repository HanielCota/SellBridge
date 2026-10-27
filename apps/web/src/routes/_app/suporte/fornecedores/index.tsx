import {
  supplierConversationsSearchSchema,
  type SupplierConversationsSearch,
} from "@sellbridge/shared/schemas";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ConversationsPage } from "@/components/supplier-support/conversations-page";
import { myConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/suporte/fornecedores/")({
  validateSearch: supplierConversationsSearchSchema,
  // A supplier's inbox has its own name: the stores that write to it.
  beforeLoad: ({ context }) => {
    if (context.session.profileKind === "supplier") {
      throw redirect({ to: "/suporte/revendedores" });
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, myConversationsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Fornecedores | Suporte | SellBridge" }] }),
  component: SupplierConversationsRoute,
});

function SupplierConversationsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function update(patch: Partial<SupplierConversationsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true });
  }
  return <ConversationsPage kind="seller" search={search} onSearchChange={update} />;
}
