import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { SessionUser } from "@/features/auth/session.functions";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { UserAvatar } from "./user-avatar";
import { SolarIcon } from "./solar-icon";
import { UserMenu } from "./user-menu";

/** A shield on the photo while the team mode is on; the switch itself is in the menu. */
function TeamModeMark() {
  return (
    <span aria-hidden="true" className="staff-account-badge">
      <SolarIcon name="shield" className="size-3" />
    </span>
  );
}

function ProfilePhoto({ user, adminMode }: { user: SessionUser; adminMode: boolean }) {
  return (
    <span className="relative order-last shrink-0">
      <UserAvatar name={user.name} image={user.image} className="staff-account-avatar size-11" />
      {adminMode ? <TeamModeMark /> : null}
    </span>
  );
}

function ProfileIdentity({ user, adminMode }: { user: SessionUser; adminMode: boolean }) {
  return (
    <>
      <span className="sr-only md:not-sr-only md:min-w-0 md:flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
        <span className="block truncate text-footnote text-muted-foreground">
          <bdi dir="ltr">{user.email}</bdi>
        </span>
        {adminMode ? <span className="sr-only">, {teamModeActiveTag(user.role)}</span> : null}
      </span>
      <SolarIcon
        name="down"
        className="hidden size-4 group-data-[state=open]:rotate-180 md:block"
      />
    </>
  );
}

/**
 * The header account card shows a photo (or initials), name and e-mail. It keeps the avatar
 * visible at narrow widths and opens its menu below.
 */
export function ProfileCard({
  user,
  adminMode,
  profileKind,
}: {
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
}) {
  return (
    <UserMenu
      user={user}
      adminMode={adminMode}
      profileKind={profileKind}
      // min-w-0: a long name or e-mail is cut short instead of widening the header.
      className="staff-header-account min-w-0 shrink-0 rounded-full md:w-64 md:rounded-2xl md:py-1 md:ps-3 md:pe-1"
    >
      <ProfilePhoto user={user} adminMode={adminMode} />
      <ProfileIdentity user={user} adminMode={adminMode} />
    </UserMenu>
  );
}
