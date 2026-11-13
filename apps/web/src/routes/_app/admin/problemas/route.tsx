import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/** Errors and their context are for admins; the rest of the team lands on the support inbox. */
export const Route = createFileRoute("/_app/admin/problemas")({
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "audit.view")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  component: Outlet,
});
