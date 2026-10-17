import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { isActivePath } from "@/features/navigation/nav-items";

export const SUPPLIER_PANEL_PATH = "/fornecedor/painel";
export const SELLER_HOME_PATH = "/dashboard";

/** Pages about the account, not a profile: every profile reaches them. */
const ACCOUNT_PATHS = ["/perfil", "/suporte", "/admin"];

/**
 * Where a profile is sent when it opens a page of the other profile, or null to stay. A supplier
 * only has its panel and the account pages; a seller has everything but the panel.
 */
export function profileRedirectFor(kind: ProfileKind, pathname: string): string | null {
  const isPanel = isActivePath(pathname, SUPPLIER_PANEL_PATH);
  if (kind === "seller") {
    return isPanel ? SELLER_HOME_PATH : null;
  }
  const isAccountPage = ACCOUNT_PATHS.some((path) => isActivePath(pathname, path));
  if (isPanel || isAccountPage) {
    return null;
  }
  return SUPPLIER_PANEL_PATH;
}
