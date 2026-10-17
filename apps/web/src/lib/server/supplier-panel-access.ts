import { forbiddenError } from "@sellbridge/shared/errors";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";

/** Who is calling a supplier panel function, as the access rule reads it. */
export type SupplierPanelViewer =
  | { readonly kind: "team" }
  | { readonly kind: "supplier"; readonly supplierId: string | null }
  | { readonly kind: "seller" };

/**
 * The supplier panel answers the supplier profile for its own catalog only, and the team (a
 * platform admin) for any supplier, so support and review can act on a supplier's behalf.
 */
export function assertSupplierPanelAccess(
  viewer: SupplierPanelViewer,
  requestedSupplierId: string,
): void {
  if (viewer.kind === "team") {
    return;
  }
  if (viewer.kind === "seller") {
    throw forbiddenError("O painel do fornecedor é só para perfis de fornecedor.");
  }
  if (viewer.supplierId === null) {
    throw forbiddenError("Cadastre sua marca para usar o painel do fornecedor.");
  }
  if (viewer.supplierId !== requestedSupplierId) {
    throw forbiddenError("Este catálogo é de outro fornecedor.");
  }
}

/** Seller screens and functions (stores, listings, orders, reports) refuse a supplier profile. */
export function assertSellerProfile(kind: ProfileKind): void {
  if (kind === "supplier") {
    throw forbiddenError("Esta área é do perfil de vendedor. Use o painel do fornecedor.");
  }
}
