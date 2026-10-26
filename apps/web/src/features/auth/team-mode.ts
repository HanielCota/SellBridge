import { isStaffRole } from "@sellbridge/shared/staff-access";

/**
 * The switch that shows the team tools is named after who uses it: admins see "Modo
 * administrador", support agents and supervisors see "Modo equipe".
 */
export function teamModeName(role: string): string {
  return role === "admin" ? "Modo administrador" : "Modo equipe";
}

/** The short tag under the name in the account chip while the mode is on. */
export function teamModeActiveTag(role: string): string {
  return role === "admin" ? "Modo admin ativo" : "Modo equipe ativo";
}

/**
 * Whether the team tools show. Agents and supervisors only work on the team side, so the mode
 * starts on for them until they turn it off; an admin, who also runs a store, starts with it
 * off. `preference` is the saved choice ("on"/"off"), undefined before any.
 */
export function isTeamModeOn(role: string, preference: string | undefined): boolean {
  if (!isStaffRole(role)) {
    return false;
  }
  if (preference === undefined) {
    return role !== "admin";
  }
  return preference === "on";
}

/**
 * Where agents and supervisors in team mode start instead of the sales dashboard: they have no
 * store, so the dashboard only showed the reseller's setup. Null for everyone else.
 */
export function teamHomeFor(role: string, teamModeOn: boolean): "/admin/chamados" | null {
  if (!teamModeOn) {
    return null;
  }
  if (role === "admin" || !isStaffRole(role)) {
    return null;
  }
  return "/admin/chamados";
}
