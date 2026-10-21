import { CaretDownIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { Ref } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BADGE_DESCRIPTIONS, type NavBadge, type NavItem } from "@/features/navigation/nav-items";
import { chooseOnPlainClick, navTabClassName, TabBadge } from "./nav-tab-parts";

/**
 * In team mode the seller (or supplier) tabs fold into one tab: with the team's five tabs the
 * twelve never fit the 1440px row and the hidden-scrollbar capsule clipped Chamados mid-word.
 */
export function ProfileTabsMenu({
  label,
  items,
  activeTo,
  counts,
  paintsOwnPill,
  padding,
  triggerRef,
  onChoose,
}: {
  label: string;
  items: readonly NavItem[];
  activeTo: NavItem["to"] | null;
  counts: Record<NavBadge, number>;
  paintsOwnPill: boolean;
  padding: string;
  triggerRef: Ref<HTMLButtonElement>;
  onChoose: (to: NavItem["to"]) => void;
}) {
  const isActive = items.some((item) => item.to === activeTo);
  const failedListings = items.some((item) => item.badge === "failedListings")
    ? counts.failedListings
    : 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        className={navTabClassName({ isActive, paintsOwnPill, padding })}
      >
        {label}
        {failedListings > 0 ? (
          <TabBadge
            isError
            count={failedListings}
            description={BADGE_DESCRIPTIONS.failedListings(failedListings)}
          />
        ) : null}
        <CaretDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {items.map((item) => (
          <ProfileTabsMenuItem
            key={item.to}
            item={item}
            isActive={item.to === activeTo}
            count={item.badge === undefined ? 0 : counts[item.badge]}
            onChoose={onChoose}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileTabsMenuItem({
  item,
  isActive,
  count,
  onChoose,
}: {
  item: NavItem;
  isActive: boolean;
  count: number;
  onChoose: (to: NavItem["to"]) => void;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link
        to={item.to}
        aria-current={isActive ? "page" : undefined}
        className={isActive ? "font-medium" : undefined}
        onClick={(event) => chooseOnPlainClick(event, () => onChoose(item.to))}
      >
        <span className="flex-1">{item.label}</span>
        {item.badge !== undefined && count > 0 ? (
          <TabBadge
            isError={item.badge === "failedListings"}
            count={count}
            description={BADGE_DESCRIPTIONS[item.badge](count)}
          />
        ) : null}
      </Link>
    </DropdownMenuItem>
  );
}
