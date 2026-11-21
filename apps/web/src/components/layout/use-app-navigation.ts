import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { hasStaffPermission, isStaffRole } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { AccountProfile, SessionUser } from "@/features/auth/session.functions";
import { staffShipmentCountsQueryOptions } from "@/features/admin-shipments/shipments.queries";
import {
  attentionCountsQueryOptions,
  openTicketCountQueryOptions,
} from "@/features/navigation/navigation.queries";
import {
  ADMIN_NAV_ITEMS,
  NAV_ITEMS,
  type NavItem,
  switchedOnItems,
} from "@/features/navigation/nav-items";
import { adminProfileSections, isCurrentSection } from "@/features/navigation/profile-sections";
import { myUnreadConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import type { AppNavigation } from "./nav-list";
import type { BadgeCounts } from "./nav-tab";

function useNavCounts({
  isAdmin,
  canSeeShipments,
  isSupplier,
  hasProfile,
}: {
  isAdmin: boolean;
  canSeeShipments: boolean;
  isSupplier: boolean;
  hasProfile: boolean;
}): BadgeCounts {
  const attention = useQuery({ ...attentionCountsQueryOptions(), enabled: hasProfile });
  const openTickets = useQuery({ ...openTicketCountQueryOptions(), enabled: isAdmin });
  const storeMessages = useQuery({ ...myUnreadConversationsQueryOptions(), enabled: isSupplier });
  const shipments = useQuery({ ...staffShipmentCountsQueryOptions(), enabled: canSeeShipments });
  return {
    buyerQuestions: attention.data?.buyerQuestions ?? 0,
    failedListings: attention.data?.failedListings ?? 0,
    openTickets: isAdmin ? (openTickets.data ?? 0) : 0,
    parcelAlerts: attention.data?.parcelAlerts ?? 0,
    staffParcelAlerts: canSeeShipments
      ? (shipments.data?.late ?? 0) + (shipments.data?.problem ?? 0)
      : 0,
    storeMessages: isSupplier ? (storeMessages.data ?? 0) : 0,
    supportReplies: attention.data?.unreadSupportReplies ?? 0,
    supplierOrders: attention.data?.supplierOrders ?? 0,
  };
}

interface NavigationInput {
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
  profiles: readonly AccountProfile[];
  /** A team member with no profile: the team's pages and the profile page only. */
  teamOnly: boolean;
  /** Switched-off pages (`NavItem.feature`) stay out of the menu. */
  buyerQuestionsEnabled: boolean;
}

function teamItemsFor(role: string): NavItem[] {
  return ADMIN_NAV_ITEMS.filter(
    (item) => item.permission === undefined || hasStaffPermission(role, item.permission),
  );
}

/** The menu's items; team mode adds the team's and lets the admin switch profiles. */
function navigationFor(input: NavigationInput): AppNavigation {
  const { user, adminMode, profileKind, profiles, teamOnly } = input;
  if (teamOnly) {
    return { profileItems: [], profileSections: [], teamItems: teamItemsFor(user.role), teamOnly };
  }
  const sections = adminProfileSections(profileKind, profiles).map((section) => ({
    ...section,
    items: switchedOnItems(section.items, input.buyerQuestionsEnabled),
  }));
  const profileItems =
    sections.find(isCurrentSection)?.items ??
    switchedOnItems(NAV_ITEMS, input.buyerQuestionsEnabled);
  if (adminMode) {
    return {
      profileItems,
      profileSections: sections,
      teamItems: teamItemsFor(user.role),
      teamOnly,
    };
  }
  return { profileItems, profileSections: [], teamItems: [], teamOnly };
}

/** The team role while its mode is off, so the menu offers the way in; null otherwise. */
function teamModeRoleOf(role: string, adminMode: boolean): string | null {
  if (adminMode) {
    return null;
  }
  return isStaffRole(role) ? role : null;
}

export interface AppNavigationState {
  navigation: AppNavigation;
  counts: BadgeCounts;
  pathname: string;
  /** The team role while its mode is off, so the menu offers the way in; null otherwise. */
  teamModeRole: string | null;
}

/** Everything the sidebar, the phone menu and the header share about where the user can go. */
export function useAppNavigation(input: NavigationInput): AppNavigationState {
  const { user, adminMode, profileKind, teamOnly } = input;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const counts = useNavCounts({
    isAdmin: adminMode,
    canSeeShipments: adminMode && hasStaffPermission(user.role, "shipments.view"),
    isSupplier: profileKind === "supplier",
    hasProfile: !teamOnly,
  });
  return {
    navigation: navigationFor(input),
    counts,
    pathname,
    teamModeRole: teamModeRoleOf(user.role, adminMode),
  };
}
