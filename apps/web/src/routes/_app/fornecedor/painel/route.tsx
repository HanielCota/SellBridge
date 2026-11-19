import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { SUPPLIER_BRAND_PATH } from "@/features/auth/profile-routes";
import { SupplierOffBanner } from "@/components/supplier-panel/supplier-off-banner";
import { StoreClosedBanner } from "@/components/supplier-panel/store/store-closed-banner";
import { getOwnSupplierFn } from "@/features/supplier-panel/panel.functions";
import { SupplierApprovalBanner } from "@/components/supplier-approval/supplier-approval-banner";

export const Route = createFileRoute("/_app/fornecedor/painel")({
  // Before the brand exists, every panel page leads to "Cadastre sua marca".
  loader: async ({ location }) => {
    const own = await getOwnSupplierFn();
    if (own.supplier === null && location.pathname !== SUPPLIER_BRAND_PATH) {
      throw redirect({ to: SUPPLIER_BRAND_PATH });
    }
    return own;
  },
  head: () => ({ meta: [{ title: "Painel do fornecedor | SellBridge" }] }),
  component: SupplierPanelLayout,
});

/**
 * Panel pages read the brand from this layout (`usePanelSupplierId`): until it exists only the
 * brand page renders, so no page ever draws for an instant without its supplier (the loader is
 * already redirecting, or the data is refreshing right after the brand was saved).
 */
function SupplierPanelLayout() {
  const { supplier, approval } = Route.useLoaderData();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (supplier === null && pathname !== SUPPLIER_BRAND_PATH) {
    return null;
  }
  // Not approved yet (or refused): resellers see nothing, so this outranks the other banners.
  if (approval !== null && approval.status !== "approved") {
    return (
      <div className="space-y-6">
        <SupplierApprovalBanner approval={approval} />
        <Outlet />
      </div>
    );
  }
  if (supplier !== null && !supplier.active) {
    return (
      <div className="space-y-6">
        <SupplierOffBanner />
        <Outlet />
      </div>
    );
  }
  // A store the supplier closed (holidays, no stock): only a switched-off account outranks it.
  if (supplier !== null && supplier.salesClosedAt !== null) {
    return (
      <div className="space-y-6">
        <StoreClosedBanner supplierId={supplier.id} />
        <Outlet />
      </div>
    );
  }
  return <Outlet />;
}
