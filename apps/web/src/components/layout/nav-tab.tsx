import { Link } from "@tanstack/react-router";
import type { MouseEvent, Ref } from "react";
import { Hint } from "@/components/ui/hint";
import {
  BADGE_DESCRIPTIONS,
  isActivePath,
  type NavBadge,
  type NavItem,
} from "@/features/navigation/nav-items";
import { cn } from "@/lib/utils";
import { navTabAction, navTabClassName, TabBadge } from "./nav-tab-parts";

export type BadgeCounts = Record<NavBadge, number>;

export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact === true) {
    return pathname === item.to;
  }
  return [item.to, ...(item.also ?? [])].some((target) => isActivePath(pathname, target));
}

export function NavTab({
  item,
  isActive,
  count,
  paintsOwnPill = true,
  tabRef,
  onNavigate,
  padding = "px-4",
  withHint = false,
  iconClassName = "size-5",
  profileSlug = null,
}: {
  item: NavItem;
  isActive: boolean;
  count: number;
  /** False while a shared sliding pill sits behind the active tab instead. */
  paintsOwnPill?: boolean;
  tabRef?: Ref<HTMLAnchorElement>;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Horizontal padding from the header layout. */
  padding?: string;
  /** Desktop tabs explain their section on hover; in the phone sheet a tap just opens it. */
  withHint?: boolean;
  /** Icon classes from the header layout. */
  iconClassName?: string;
  /** Another profile of the account (`?perfil=`); null stays on the tab's profile. */
  profileSlug?: string | null;
}) {
  const description = item.badge && count > 0 ? BADGE_DESCRIPTIONS[item.badge](count) : null;
  const action = navTabAction(item.to);
  const TabIcon = action?.icon;
  const link = (
    <Link
      ref={tabRef}
      to={item.to}
      {...(profileSlug === null ? {} : { search: { perfil: profileSlug } })}
      aria-current={isActive ? "page" : undefined}
      activeOptions={{ exact: !isActive }}
      onClick={onNavigate}
      className={navTabClassName({ isActive, paintsOwnPill, padding })}
    >
      {TabIcon ? <TabIcon className={cn("shrink-0", iconClassName)} aria-hidden="true" /> : null}
      {item.label}
      {description ? (
        <TabBadge
          isError={item.badge === "failedListings"}
          count={count}
          description={description}
        />
      ) : null}
    </Link>
  );
  return (
    <Hint label={withHint ? action?.hint : undefined} openOnTap={false}>
      {link}
    </Hint>
  );
}

/** Sets the team's tabs (or the support link) apart from the profile's. */
export function TeamDivider({ vertical }: { vertical: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("shrink-0 bg-border", vertical ? "mx-1 h-5 w-px" : "mx-3 my-1.5 h-px")}
    />
  );
}
