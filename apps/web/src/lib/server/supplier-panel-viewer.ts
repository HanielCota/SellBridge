import { findSupplierOfProfile } from "@sellbridge/database/repositories";
import { database } from "./database.ts";
import type { SupplierPanelViewer } from "./supplier-panel-access.ts";
import type { TenantSession } from "./tenant-session.ts";

/**
 * A platform admin in their own session is the team; an admin inside a supplier's account
 * through "Entrar como cliente" is that supplier, with the same limits.
 */
export async function resolveSupplierPanelViewer(
  session: TenantSession,
): Promise<SupplierPanelViewer> {
  if (session.role === "admin" && session.impersonatedBy === null) {
    return { kind: "team" };
  }
  if (session.profileKind === "seller") {
    return { kind: "seller" };
  }
  const supplier = await findSupplierOfProfile(database, session.tenantId);
  return { kind: "supplier", supplierId: supplier === null ? null : supplier.id };
}
