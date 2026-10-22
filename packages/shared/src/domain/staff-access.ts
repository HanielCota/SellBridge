/**
 * The SellBridge team. `agent` answers tickets, `supervisor` also runs the queue (hands tickets
 * to others, sees the metrics) and `admin` does everything, including customer accounts.
 * In the Better Auth admin plugin only `admin` bans and sets roles; every team role may
 * impersonate, and `impersonation-access.ts` limits agents and supervisors to open tickets.
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
  /** Customer accounts: profile, region, stores, ban, sessions, roles; enters any account. */
  | "customers.manage"
  /** Enters a customer's account as them; without `customers.manage`, only with an open ticket. */
  | "customers.impersonate"
  /** The platform-wide trail of what the team did (item 28.b): accounts, catalog, support. */
  | "audit.view";

const PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  agent: ["support.answer", "support.triage", "customers.impersonate"],
  supervisor: [
    "support.answer",
    "support.triage",
    "support.assign_others",
    "support.metrics",
    "customers.impersonate",
  ],
  admin: [
    "support.answer",
    "support.triage",
    "support.assign_others",
    "support.metrics",
    "customers.manage",
    "customers.impersonate",
    "audit.view",
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
