import { isStaffRole } from "@sellbridge/shared/staff-access";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { setAdminMode } from "@/features/auth/session.functions";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: async ({ context, location, preload }) => {
    if (context.session.adminMode) {
      return;
    }
    // A team member who opens an /admin link wants the team area: the mode turns on (the menu
    // switch turns it off again) instead of a silent bounce to the sales dashboard. Never on a
    // hover preload: only a real navigation switches it.
    if (isStaffRole(context.session.user.role) && !preload) {
      await setAdminMode({ data: { enabled: true } });
      throw redirect({ href: location.href });
    }
    throw redirect({ to: "/dashboard" });
  },
  component: Outlet,
});
