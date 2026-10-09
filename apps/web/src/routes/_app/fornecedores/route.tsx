import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getTenantRegion } from "@/features/region/region.functions";

export const Route = createFileRoute("/_app/fornecedores")({
  beforeLoad: async ({ location }) => {
    const region = await getTenantRegion();
    if (!region) {
      throw redirect({ to: "/onboarding", search: { redirect: location.href } });
    }
    return { region };
  },
  component: Outlet,
});
