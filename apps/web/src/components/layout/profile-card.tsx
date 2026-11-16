import { CaretUpIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { SessionUser } from "@/features/auth/session.functions";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { UserAvatar } from "./user-avatar";
import { UserMenu } from "./user-menu";

/** A shield on the photo while the team mode is on; the switch itself is in the menu. */
function TeamModeMark() {
  return (
    <span
      aria-hidden="true"
      className="absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full bg-brand text-primary-foreground ring-2 ring-card"
    >
      <ShieldCheckIcon className="size-3" weight="bold" />
    </span>
  );
}

/**
 * The account at the foot of the menu: photo (or initials), name and e-mail, with a caret that
 * flips while its menu, opening above, is open.
 */
export function ProfileCard({
  user,
  adminMode,
  profileKind,
  onNavigate,
}: {
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <UserMenu
      user={user}
      adminMode={adminMode}
      profileKind={profileKind}
      onNavigate={onNavigate}
      // min-w-0: a long name or e-mail is cut short instead of widening the sidebar. The page's
      // bottom scroll padding (kept clear of the bulk bar) made focusing the card, always in
      // sight at the sidebar's foot, scroll the page by hundreds of pixels; the margin cancels it.
      className="w-full min-w-0 -scroll-mb-20 rounded-xl p-2 hover:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.06]"
    >
      <span className="relative shrink-0">
        <UserAvatar name={user.name} image={user.image} className="size-10" />
        {adminMode ? <TeamModeMark /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
        <span className="block truncate text-footnote text-muted-foreground">{user.email}</span>
        {adminMode ? <span className="sr-only">, {teamModeActiveTag(user.role)}</span> : null}
      </span>
      <CaretUpIcon
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground group-data-[state=open]:rotate-180 group-data-[state=open]:text-foreground"
        weight="bold"
        aria-hidden="true"
      />
    </UserMenu>
  );
}
