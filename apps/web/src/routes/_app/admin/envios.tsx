import { staffShipmentSearchSchema, type StaffShipmentSearch } from "@sellbridge/shared/schemas";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { StaffShipmentsPage } from "@/components/admin-shipments/staff-shipments-page";
import { staffShipmentsQueryOptions } from "@/features/admin-shipments/shipments.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/envios")({
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "shipments.view")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  validateSearch: staffShipmentSearchSchema,
  loaderDeps: ({ search }) => ({ group: search.group, query: search.query, page: search.page }),
  loader: ({ context, deps }) =>
    prefetchOnServer(context.queryClient, staffShipmentsQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Envios (admin) | SellBridge" }] }),
  component: ShipmentsRoute,
});

function ShipmentsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // Choosing a parcel or a filter changes the list, not the page: keep the scroll in place.
  const onSearchChange = (patch: Partial<StaffShipmentSearch>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
  return <StaffShipmentsPage search={search} onSearchChange={onSearchChange} />;
}
