import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { SUPPLIER_BRAND_PATH } from "@/features/auth/profile-routes";
import { getOwnSupplierFn } from "@/features/supplier-panel/panel.functions";

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
  const { supplier } = Route.useLoaderData();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (supplier === null && pathname !== SUPPLIER_BRAND_PATH) {
    return null;
  }
  return <Outlet />;
}
