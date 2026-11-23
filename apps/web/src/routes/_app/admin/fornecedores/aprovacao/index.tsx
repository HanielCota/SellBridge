import { supplierApprovalQueueSearchSchema } from "@sellbridge/shared/supplier-approval";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ApprovalQueue } from "@/components/supplier-approval/approval-queue";
import { supplierApprovalQueueQueryOptions } from "@/features/supplier-approval/approval.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/fornecedores/aprovacao/")({
  validateSearch: supplierApprovalQueueSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    prefetchOnServer(context.queryClient, supplierApprovalQueueQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Fornecedores em análise (equipe) | SellBridge" }] }),
  component: ApprovalQueuePage,
});

function ApprovalQueuePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <ApprovalQueue
      search={search}
      onPageChange={(page) =>
        void navigate({ search: (previous) => ({ ...previous, page }), replace: true })
      }
    />
  );
}
