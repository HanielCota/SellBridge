import { getRouteApi } from "@tanstack/react-router";

const panelRoute = getRouteApi("/_app/fornecedor/painel");

/**
 * The supplier the panel pages work on: the profile's own, read once by the panel layout, which
 * only renders its pages after the brand exists.
 */
export function usePanelSupplierId(): string {
  const { supplier } = panelRoute.useLoaderData();
  if (supplier === null) {
    throw new Error("O painel só abre as páginas depois que a marca está cadastrada.");
  }
  return supplier.id;
}
