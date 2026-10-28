import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { teamHomeFor } from "@/features/auth/team-mode";
import { ADMIN_NAV_ITEMS } from "@/features/navigation/nav-items";

/** Where switching the mode on lands: the first team page the role may open. */
function firstTeamPage(role: string): (typeof ADMIN_NAV_ITEMS)[number]["to"] {
  const page = ADMIN_NAV_ITEMS.find(
    (item) => item.permission === undefined || hasStaffPermission(role, item.permission),
  );
  if (page === undefined) {
    throw new Error(`No team page is open to the role "${role}"`);
  }
  return page.to;
}

/**
 * Where the team's way in lands: the same page signing in opens for agents and supervisors (the
 * ticket queue), else the first team page the role may open.
 */
export function teamEntryPage(role: string): (typeof ADMIN_NAV_ITEMS)[number]["to"] {
  return teamHomeFor(role, true) ?? firstTeamPage(role);
}
