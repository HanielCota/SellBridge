import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    if (!context.session.adminMode) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: Outlet,
});
