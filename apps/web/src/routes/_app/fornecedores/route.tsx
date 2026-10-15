import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getTenantRegion } from "@/features/region/region.functions";

/**
 * Suppliers are open to every reseller, address or not; the region, when saved, only marks who
 * delivers to them (publishing still requires it).
 */
export const Route = createFileRoute("/_app/fornecedores")({
  beforeLoad: async () => ({ region: await getTenantRegion() }),
  component: Outlet,
});
