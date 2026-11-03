import { ShieldCheckIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { accountLabel } from "@/features/auth/account-label";
import type { SessionUser } from "@/features/auth/session.functions";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./user-avatar";
import { UserMenu } from "./user-menu";

/**
 * The account at the foot of the menu: photo, name and role (or the team mode), opening the
 * account pages, the theme and signing out. Shrunk to the photo, a shield still shows the mode.
 */
export function AccountChip({
  user,
  supportReplies,
  adminMode,
  profileKind,
  collapsed = false,
}: {
  user: SessionUser;
  supportReplies: number;
  adminMode: boolean;
  profileKind: ProfileKind;
  collapsed?: boolean;
}) {
  return (
    <UserMenu
      user={user}
      supportReplies={supportReplies}
      adminMode={adminMode}
      profileKind={profileKind}
      side="top"
      compact={collapsed}
      className={cn(
        // min-w-0: a grid item keeps its content width, so a long brand name ran past the sidebar.
        "w-full min-w-0 rounded-2xl p-1.5 hover:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.06]",
        collapsed && "justify-center",
      )}
    >
      <span className="relative shrink-0">
        <UserAvatar name={user.name} image={user.image} />
        {adminMode && collapsed ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-brand text-primary-foreground ring-2 ring-card"
          >
            <ShieldCheckIcon className="size-3" weight="bold" />
          </span>
        ) : null}
      </span>
      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 leading-tight"}>
        <span className="block truncate text-base font-medium">{user.name}</span>
        {adminMode ? (
          <span className="flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-brand-text">
            <span className="size-1.5 rounded-full bg-brand-mark" aria-hidden="true" />
            {teamModeActiveTag(user.role)}
          </span>
        ) : (
          <span className="block truncate text-sm text-muted-foreground">
            {accountLabel(user.role, profileKind)}
          </span>
        )}
      </span>
    </UserMenu>
  );
}
