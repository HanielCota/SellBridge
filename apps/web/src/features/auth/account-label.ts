import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { CUSTOMER_ROLE_LABELS, type CustomerRole } from "@sellbridge/shared/schemas";

const SUPPLIER_LABEL = "Fornecedor";

function isCustomerRole(role: string): role is CustomerRole {
  return role in CUSTOMER_ROLE_LABELS;
}

/** The account role in Portuguese ("Revendedor", "Administrador"…); an unknown role as stored. */
export function roleLabel(role: string): string {
  if (isCustomerRole(role)) {
    return CUSTOMER_ROLE_LABELS[role];
  }
  return role;
}

/** Under the account name: the team role, or what the active profile is for a customer. */
export function accountLabel(role: string, profileKind: ProfileKind): string {
  if (role === "user" && profileKind === "supplier") {
    return SUPPLIER_LABEL;
  }
  return roleLabel(role);
}
