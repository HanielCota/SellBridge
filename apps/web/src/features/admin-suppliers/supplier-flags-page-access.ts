import { hasStaffPermission } from "@sellbridge/shared/staff-access";

interface FlagsPageSession {
  adminMode: boolean;
  user: { role?: string | null | undefined };
}

export type FlagsPageRedirect = "/login" | "/dashboard" | "/admin/chamados";

/**
 * Who may open `/admin/fornecedores/<id>/flags` (coordinator decision (a), MVP function 6): any
 * team member in team mode with `suppliers.view_flags`. Sellers, suppliers and anonymous
 * visitors are sent away; the server functions behind the page check the permission again.
 */
export function flagsPageRedirect(session: FlagsPageSession | null): FlagsPageRedirect | null {
  if (session === null) {
    return "/login";
  }
  if (!session.adminMode) {
    return "/dashboard";
  }
  if (!hasStaffPermission(session.user.role, "suppliers.view_flags")) {
    return "/admin/chamados";
  }
  return null;
}
