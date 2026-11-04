import { Link } from "@tanstack/react-router";
import { useEffect, useRef, type MouseEvent } from "react";
import { Hint } from "@/components/ui/hint";
import { BADGE_DESCRIPTIONS, type NavBadge, type NavItem } from "@/features/navigation/nav-items";
import { cn } from "@/lib/utils";
import { navTabAction, navTabClassName, TabBadge } from "./nav-tab-parts";

export type BadgeCounts = Record<NavBadge, number>;

function tabHint(
  item: NavItem,
  hint: string | undefined,
  { collapsed, withHint }: { collapsed: boolean; withHint: boolean },
): string | undefined {
  if (collapsed) {
    // Only the icon shows, so the name comes first and the explanation after it.
    return hint === undefined ? item.label : `${item.label}: ${hint}`;
  }
  return withHint ? hint : undefined;
}

/** The team's list is longer than the window: the open page's item scrolls into sight. */
function useScrolledIntoSightWhenActive(isActive: boolean) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (isActive) {
      linkRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isActive]);
  return linkRef;
}

function tabPadding(collapsed: boolean, inline: boolean): string {
  if (collapsed) {
    return "px-0";
  }
  return inline ? "px-3" : "px-4";
}

function linkClassName(isActive: boolean, collapsed: boolean, inline: boolean): string {
  return cn(
    navTabClassName({ isActive, paintsOwnPill: true, padding: tabPadding(collapsed, inline) }),
    collapsed && "justify-center",
    inline && "shrink-0 text-[0.9375rem]",
  );
}

function labelClassName(collapsed: boolean, inline: boolean): string {
  if (collapsed) {
    return "sr-only";
  }
  return inline ? "whitespace-nowrap" : "min-w-0 flex-1 truncate";
}

export function NavTab({
  item,
  isActive,
  count,
  onNavigate,
  withHint = false,
  collapsed = false,
  inline = false,
  profileSlug = null,
}: {
  item: NavItem;
  isActive: boolean;
  count: number;
  onNavigate?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
  /** Desktop items explain their section on hover; in the phone sheet a tap just opens it. */
  withHint?: boolean;
  /** The sidebar shrunk to its icons: the label stays for screen readers and the hint. */
  collapsed?: boolean;
  /** A tab in a row (the admin strip): no icon and the whole label, so the row sets its width. */
  inline?: boolean;
  /** Another profile of the account (`?perfil=`); null stays on the tab's profile. */
  profileSlug?: string | null;
}) {
  const linkRef = useScrolledIntoSightWhenActive(isActive);
  const description = item.badge && count > 0 ? BADGE_DESCRIPTIONS[item.badge](count) : null;
  const action = navTabAction(item.to);
  const TabIcon = action?.icon;
  const badge = description ? (
    <TabBadge
      isError={item.badge === "failedListings"}
      count={count}
      description={description}
      onActive={isActive}
    />
  ) : null;
  const link = (
    <Link
      ref={linkRef}
      to={item.to}
      {...(profileSlug === null ? {} : { search: { perfil: profileSlug } })}
      aria-current={isActive ? "page" : undefined}
      activeOptions={{ exact: !isActive }}
      onClick={onNavigate}
      className={linkClassName(isActive, collapsed, inline)}
    >
      {TabIcon === undefined || inline ? null : (
        <TabIcon className="size-5 shrink-0" aria-hidden="true" />
      )}
      <span className={labelClassName(collapsed, inline)}>{item.label}</span>
      {collapsed && badge !== null ? (
        <span className="absolute -top-1 -right-1 scale-90">{badge}</span>
      ) : (
        badge
      )}
    </Link>
  );
  return (
    <Hint label={tabHint(item, action?.hint, { collapsed, withHint })} openOnTap={false}>
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
