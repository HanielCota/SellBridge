/** Which parts of a team member's sidebar show. */
export interface StaffMenuSections {
  readonly business: boolean;
  readonly team: boolean;
  /** Nothing to show: the sidebar says so instead of staying blank. */
  readonly empty: boolean;
}

/**
 * A team member without a business of their own (`teamOnly`) has only the team pages, so those
 * show whether or not admin mode is on; otherwise the sidebar would be empty.
 */
export function staffMenuSections({
  teamOnly,
  adminMode,
  teamItemCount,
}: {
  teamOnly: boolean;
  adminMode: boolean;
  teamItemCount: number;
}): StaffMenuSections {
  const business = !teamOnly;
  const team = (adminMode || teamOnly) && teamItemCount > 0;
  return { business, team, empty: !business && !team };
}
