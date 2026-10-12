import { adminSupplierSearchSchema } from "@sellbridge/shared/schemas";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SupplierIndex } from "@/components/admin-suppliers/supplier-index";
import { adminSuppliersQueryOptions } from "@/features/admin-suppliers/suppliers.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/fornecedores/")({
  validateSearch: adminSupplierSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    prefetchOnServer(context.queryClient, adminSuppliersQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Fornecedores (admin) | SellBridge" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <SupplierIndex
      search={search}
      onSearch={(query) =>
        void navigate({ search: (previous) => ({ ...previous, query, page: 1 }), replace: true })
      }
      onPageChange={(page) =>
        void navigate({ search: (previous) => ({ ...previous, page }), replace: true })
      }
      onCreated={(supplierId) =>
        void navigate({ to: "/admin/fornecedores/$supplierId", params: { supplierId } })
      }
    />
  );
}
