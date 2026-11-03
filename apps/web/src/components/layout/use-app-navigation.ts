import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { hasStaffPermission, isStaffRole } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { AccountProfile, SessionUser } from "@/features/auth/session.functions";
import { reviewQueueCountQueryOptions } from "@/features/admin-product-review/review.queries";
import { staffShipmentCountsQueryOptions } from "@/features/admin-shipments/shipments.queries";
import {
  attentionCountsQueryOptions,
  openTicketCountQueryOptions,
} from "@/features/navigation/navigation.queries";
import { ADMIN_NAV_ITEMS, NAV_ITEMS } from "@/features/navigation/nav-items";
import { adminProfileSections, isCurrentSection } from "@/features/navigation/profile-sections";
import { myUnreadConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import type { AppNavigation } from "./nav-list";
import type { BadgeCounts } from "./nav-tab";

/** `canReview`: only role admin reviews supplier products (the queue's server functions check it). */
function useNavCounts({
  isAdmin,
  canReview,
  canSeeShipments,
  isSupplier,
}: {
  isAdmin: boolean;
  canReview: boolean;
  canSeeShipments: boolean;
  isSupplier: boolean;
}): BadgeCounts {
  const attention = useQuery(attentionCountsQueryOptions());
  const openTickets = useQuery({ ...openTicketCountQueryOptions(), enabled: isAdmin });
  const productReviews = useQuery({ ...reviewQueueCountQueryOptions(), enabled: canReview });
  const storeMessages = useQuery({ ...myUnreadConversationsQueryOptions(), enabled: isSupplier });
  const shipments = useQuery({ ...staffShipmentCountsQueryOptions(), enabled: canSeeShipments });
  return {
    failedListings: attention.data?.failedListings ?? 0,
    openTickets: isAdmin ? (openTickets.data ?? 0) : 0,
    parcelAlerts: attention.data?.parcelAlerts ?? 0,
    productReviews: canReview ? (productReviews.data ?? 0) : 0,
    staffParcelAlerts: canSeeShipments
      ? (shipments.data?.late ?? 0) + (shipments.data?.problem ?? 0)
      : 0,
    storeMessages: isSupplier ? (storeMessages.data ?? 0) : 0,
    supportReplies: attention.data?.unreadSupportReplies ?? 0,
    supplierOrders: attention.data?.supplierOrders ?? 0,
  };
}

/** The menu's items; team mode adds the team's and lets the admin switch profiles. */
function navigationFor(
  user: SessionUser,
  adminMode: boolean,
  profileKind: ProfileKind,
  profiles: readonly AccountProfile[],
): AppNavigation {
  const sections = adminProfileSections(profileKind, profiles);
  const profileItems = sections.find(isCurrentSection)?.items ?? NAV_ITEMS;
  if (adminMode) {
    const teamItems = ADMIN_NAV_ITEMS.filter(
      (item) => item.permission === undefined || hasStaffPermission(user.role, item.permission),
    );
    return { profileItems, profileSections: sections, teamItems };
  }
  return { profileItems, profileSections: [], teamItems: [] };
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
export function useAppNavigation({
  user,
  adminMode,
  profileKind,
  profiles,
}: {
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
  profiles: readonly AccountProfile[];
}): AppNavigationState {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const counts = useNavCounts({
    isAdmin: adminMode,
    canReview: adminMode && user.role === "admin",
    canSeeShipments: adminMode && hasStaffPermission(user.role, "shipments.view"),
    isSupplier: profileKind === "supplier",
  });
  return {
    navigation: navigationFor(user, adminMode, profileKind, profiles),
    counts,
    pathname,
    teamModeRole: teamModeRoleOf(user.role, adminMode),
  };
}
