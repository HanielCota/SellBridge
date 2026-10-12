import { adminSupplierSearchSchema } from "@sellbridge/shared/schemas";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SupplierDetail } from "@/components/admin-suppliers/supplier-detail";
import {
  adminProductsQueryOptions,
  adminSupplierQueryOptions,
} from "@/features/admin-suppliers/suppliers.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/fornecedores/$supplierId")({
  validateSearch: adminSupplierSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await Promise.all([
      prefetchOnServer(context.queryClient, adminSupplierQueryOptions(params.supplierId)),
      prefetchOnServer(context.queryClient, adminProductsQueryOptions(params.supplierId, deps)),
    ]);
  },
  head: () => ({ meta: [{ title: "Fornecedor (admin) | SellBridge" }] }),
  component: SupplierPage,
});

function SupplierPage() {
  const { supplierId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <SupplierDetail
      supplierId={supplierId}
      search={search}
      onSearch={(query) =>
        void navigate({ search: (previous) => ({ ...previous, query, page: 1 }), replace: true })
      }
      onPageChange={(page) =>
        void navigate({ search: (previous) => ({ ...previous, page }), replace: true })
      }
    />
  );
}
