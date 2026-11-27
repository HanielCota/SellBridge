import { CaretUpIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { SessionUser } from "@/features/auth/session.functions";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { UserAvatar } from "./user-avatar";
import { SolarIcon } from "./solar-icon";
import { UserMenu } from "./user-menu";

/** A shield on the photo while the team mode is on; the switch itself is in the menu. */
function TeamModeMark({ sidebar }: { sidebar: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        sidebar
          ? "staff-account-badge"
          : "absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full bg-brand text-primary-foreground ring-2 ring-card"
      }
    >
      {sidebar ? (
        <SolarIcon name="shield" className="size-3" />
      ) : (
        <ShieldCheckIcon className="size-3" weight="bold" />
      )}
    </span>
  );
}

function ProfilePhoto({
  user,
  adminMode,
  sidebar,
}: {
  user: SessionUser;
  adminMode: boolean;
  sidebar: boolean;
}) {
  return (
    <span className={sidebar ? "relative order-last shrink-0" : "relative shrink-0"}>
      <UserAvatar
        name={user.name}
        image={user.image}
        className={sidebar ? "staff-account-avatar size-11" : "size-10"}
      />
      {adminMode ? <TeamModeMark sidebar={sidebar} /> : null}
    </span>
  );
}

function profileTriggerClassName(inHeader: boolean): string {
  if (inHeader) {
    return "staff-header-account min-w-0 shrink-0 rounded-full md:w-64 md:rounded-2xl md:py-1 md:ps-3 md:pe-1";
  }
  return "w-full min-w-0 -scroll-mb-20 rounded-xl p-2 hover:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.06]";
}

/**
 * The account card shows a photo (or initials), name and e-mail. The header keeps the avatar
 * visible at narrow widths and opens its menu below.
 */
export function ProfileCard({
  user,
  adminMode,
  profileKind,
  onNavigate,
  inHeader = false,
}: {
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
  inHeader?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <UserMenu
      user={user}
      adminMode={adminMode}
      profileKind={profileKind}
      onNavigate={onNavigate}
      sidebar={inHeader}
      inHeader={inHeader}
      // min-w-0: a long name or e-mail is cut short instead of widening the sidebar. The page's
      // bottom scroll padding (kept clear of the bulk bar) made focusing the card, always in
      // sight at the sidebar's foot, scroll the page by hundreds of pixels; the margin cancels it.
      className={profileTriggerClassName(inHeader)}
    >
      <ProfilePhoto user={user} adminMode={adminMode} sidebar={inHeader} />
      <ProfileIdentity user={user} adminMode={adminMode} inHeader={inHeader} />
    </UserMenu>
  );
}

function ProfileIdentity({
  user,
  adminMode,
  inHeader,
}: {
  user: SessionUser;
  adminMode: boolean;
  inHeader: boolean;
}) {
  return (
    <>
      <span className={inHeader ? "sr-only md:not-sr-only md:min-w-0 md:flex-1" : "min-w-0 flex-1"}>
        <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
        <span className="block truncate text-footnote text-muted-foreground">
          <bdi dir="ltr">{user.email}</bdi>
        </span>
        {adminMode ? <span className="sr-only">, {teamModeActiveTag(user.role)}</span> : null}
      </span>
      {inHeader ? (
        <SolarIcon
          name="down"
          className="hidden size-4 group-data-[state=open]:rotate-180 md:block"
        />
      ) : (
        <CaretUpIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground group-data-[state=open]:rotate-180 group-data-[state=open]:text-foreground"
          weight="bold"
          aria-hidden="true"
        />
      )}
    </>
  );
}
