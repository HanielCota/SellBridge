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
import { isCurrentSection, type ProfileSection } from "@/features/navigation/profile-sections";
import { chooseOnPlainClick, navTabAction, navTabClassName, TabBadge } from "./nav-tab-parts";

/**
 * In team mode each profile's tabs fold into one menu tab, Revendedor and then Fornecedor: with
 * the team's six tabs the twelve never fit the 1440px row and the hidden-scrollbar capsule
 * clipped Chamados mid-word. The other profile's menu opens its pages there (`?perfil=`).
 */
export function ProfileTabsMenu({
  section,
  activeTo,
  counts,
  paintsOwnPill,
  padding,
  triggerRef,
  onChoose,
}: {
  section: ProfileSection;
  activeTo: NavItem["to"] | null;
  counts: Record<NavBadge, number>;
  paintsOwnPill: boolean;
  padding: string;
  triggerRef: Ref<HTMLButtonElement>;
  onChoose: (to: NavItem["to"]) => void;
}) {
  const isCurrent = isCurrentSection(section);
  const isActive = isCurrent && section.items.some((item) => item.to === activeTo);
  // The counters belong to the tab's own profile; the other one's would need its own query.
  const failedListings =
    isCurrent && section.items.some((item) => item.badge === "failedListings")
      ? counts.failedListings
      : 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        className={navTabClassName({ isActive, paintsOwnPill, padding })}
      >
        {section.label}
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
        {section.items.map((item) => (
          <ProfileTabsMenuItem
            key={item.to}
            item={item}
            isActive={isCurrent && item.to === activeTo}
            count={isCurrent && item.badge !== undefined ? counts[item.badge] : 0}
            profileSlug={section.slug}
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
  profileSlug,
  onChoose,
}: {
  item: NavItem;
  isActive: boolean;
  count: number;
  /** Another profile of the account; null stays on the tab's profile. */
  profileSlug: string | null;
  onChoose: (to: NavItem["to"]) => void;
}) {
  const ItemIcon = navTabAction(item.to)?.icon;
  return (
    <DropdownMenuItem asChild>
      <Link
        to={item.to}
        {...(profileSlug === null ? {} : { search: { perfil: profileSlug } })}
        aria-current={isActive ? "page" : undefined}
        className={isActive ? "font-medium" : undefined}
        onClick={(event) => {
          // A link to another profile leaves this page, so it lights no pill here.
          if (profileSlug !== null) {
            return;
          }
          chooseOnPlainClick(event, () => onChoose(item.to));
        }}
      >
        {ItemIcon ? <ItemIcon className="size-4 shrink-0" aria-hidden="true" /> : null}
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
