import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The seller's own-product page left the MVP: the platform sells only supplier products. The
 * data and the server functions stay (phase 2), so old links land on the catalog instead.
 */
export const Route = createFileRoute("/_app/products")({
  beforeLoad: () => {
    throw redirect({ to: "/catalogo", replace: true });
  },
});
