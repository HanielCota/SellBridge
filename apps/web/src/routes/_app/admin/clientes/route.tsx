import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/** Customer accounts are for admins; the rest of the team lands on the support inbox. */
export const Route = createFileRoute("/_app/admin/clientes")({
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "customers.manage")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  component: Outlet,
});
