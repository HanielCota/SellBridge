import {
  supplierConversationsSearchSchema,
  type SupplierConversationsSearch,
} from "@sellbridge/shared/schemas";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ConversationsPage } from "@/components/supplier-support/conversations-page";
import { myConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/suporte/revendedores")({
  validateSearch: supplierConversationsSearchSchema,
  // A store's inbox has its own name: the suppliers it writes to.
  beforeLoad: ({ context }) => {
    if (context.session.profileKind === "seller") {
      throw redirect({ to: "/suporte/fornecedores" });
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, myConversationsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Revendedores | Suporte | SellBridge" }] }),
  component: ResellerConversationsRoute,
});

function ResellerConversationsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function update(patch: Partial<SupplierConversationsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true });
  }
  return <ConversationsPage kind="supplier" search={search} onSearchChange={update} />;
}
