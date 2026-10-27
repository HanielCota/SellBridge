import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { SupplierFlagsPage } from "@/components/admin-suppliers/supplier-flags-page";
import { flagsPageRedirect } from "@/features/admin-suppliers/supplier-flags-page-access";
import { supplierFlagsQueryOptions } from "@/features/admin-suppliers/supplier-flags.queries";
import { prefetchOnServer } from "@/lib/prefetch";

const flagsPageParamsSchema = z.object({ supplierId: z.uuid() });

/**
 * `/admin/fornecedores/<id>/flags`, outside the admin-only supplier record (the trailing `_` keeps
 * it from nesting under it): any team member with `suppliers.view_flags`. The loader only fetches
 * the flags function, which checks the same permission on the server.
 */
export const Route = createFileRoute("/_app/admin/fornecedores/$supplierId_/flags")({
  beforeLoad: ({ context, params }) => {
    const target = flagsPageRedirect(context.session);
    if (target !== null) {
      throw redirect({ to: target });
    }
    if (!flagsPageParamsSchema.safeParse(params).success) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  loader: async ({ context, params }) => {
    await prefetchOnServer(context.queryClient, supplierFlagsQueryOptions(params.supplierId));
  },
  head: () => ({ meta: [{ title: "Flags do fornecedor | SellBridge" }] }),
  component: FlagsPage,
});

function FlagsPage() {
  const { supplierId } = Route.useParams();
  const { session } = Route.useRouteContext();
  return (
    <SupplierFlagsPage supplierId={supplierId} viewerIsAdmin={session.user.role === "admin"} />
  );
}
