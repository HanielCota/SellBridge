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
