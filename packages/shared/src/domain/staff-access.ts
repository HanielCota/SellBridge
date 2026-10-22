/**
 * The SellBridge team. `agent` answers tickets, `supervisor` also runs the queue (hands tickets
 * to others, sees the metrics) and `admin` does everything, including customer accounts.
 * Only `admin` is an admin for the Better Auth admin plugin (ban, impersonate, set roles).
 */
export const STAFF_ROLES = ["agent", "supervisor", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  agent: "Atendente",
  supervisor: "Supervisor",
  admin: "Administrador",
};

export type StaffPermission =
  /** Sees the ticket inbox and threads, replies and writes internal notes. */
  | "support.answer"
  /** Takes a ticket for themselves and changes its status, priority and category. */
  | "support.triage"
  /** Hands a ticket to another member of the team. */
  | "support.assign_others"
  /** Sees the support metrics (volume, response times, satisfaction). */
  | "support.metrics"
  /** Customer accounts: profile, region, stores, ban, sessions, roles, impersonation. */
  | "customers.manage"
  /** The platform-wide trail of what the team did (item 28.b): accounts, catalog, support. */
  | "audit.view"
  /** Sees a supplier's flags (MVP function 6): active ones and the history. */
  | "suppliers.view_flags"
  /** Applies and revokes a supplier's flags. */
  | "suppliers.flag";

const PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  agent: ["support.answer", "support.triage", "suppliers.view_flags"],
  supervisor: [
    "support.answer",
    "support.triage",
    "support.assign_others",
    "support.metrics",
    "suppliers.view_flags",
    "suppliers.flag",
  ],
  admin: [
    "support.answer",
    "support.triage",
    "support.assign_others",
    "support.metrics",
    "customers.manage",
    "audit.view",
    "suppliers.view_flags",
    "suppliers.flag",
  ],
};

/** The staff role behind a Better Auth `user.role` value; null for resellers. */
export function staffRoleOf(role: string | null | undefined): StaffRole | null {
  if (!role) {
    return null;
  }
  return STAFF_ROLES.find((staffRole) => staffRole === role) ?? null;
}

export function isStaffRole(role: string | null | undefined): boolean {
  return staffRoleOf(role) !== null;
}

export function hasStaffPermission(
  role: string | null | undefined,
  permission: StaffPermission,
): boolean {
  const staffRole = staffRoleOf(role);
  if (!staffRole) {
    return false;
  }
  return PERMISSIONS[staffRole].includes(permission);
}
