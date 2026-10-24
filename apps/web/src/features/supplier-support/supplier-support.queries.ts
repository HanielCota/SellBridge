import type { SupplierConversationsSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  countMyUnreadConversations,
  getMyConversation,
  getMyConversationOrder,
  listMyConversationOrders,
  listMyConversations,
  listMyConversationStores,
  staffGetConversation,
} from "./supplier-support.functions";

/** Same pace as the website tickets: an open thread picks up the other side's replies. */
const THREAD_REFRESH_MILLISECONDS = 15_000;
const LIST_REFRESH_MILLISECONDS = 30_000;
const COUNT_REFRESH_MILLISECONDS = 60_000;

// Under "tickets", so the same invalidations as the website support refresh these too.
export const myConversationsQueryOptions = (search: SupplierConversationsSearch) =>
  queryOptions({
    queryKey: ["tickets", "conversations", search],
    queryFn: () => listMyConversations({ data: search }),
    placeholderData: keepPreviousData,
    refetchInterval: LIST_REFRESH_MILLISECONDS,
  });

export const myUnreadConversationsQueryOptions = () =>
  queryOptions({
    queryKey: ["tickets", "conversations", "unread"],
    queryFn: () => countMyUnreadConversations(),
    refetchInterval: COUNT_REFRESH_MILLISECONDS,
  });

export const myConversationQueryOptions = (ticketId: string) =>
  queryOptions({
    queryKey: ["tickets", "conversations", "detail", ticketId],
    queryFn: () => getMyConversation({ data: { ticketId } }),
    refetchInterval: THREAD_REFRESH_MILLISECONDS,
  });

export const staffConversationQueryOptions = (ticketId: string) =>
  queryOptions({
    queryKey: ["tickets", "admin", "detail", "conversation", ticketId],
    queryFn: () => staffGetConversation({ data: { ticketId } }),
    refetchInterval: THREAD_REFRESH_MILLISECONDS,
  });

export const myConversationStoresQueryOptions = () =>
  queryOptions({
    queryKey: ["conversation-stores"],
    queryFn: () => listMyConversationStores(),
  });

export const myConversationOrderQueryOptions = (orderId: string | undefined) =>
  queryOptions({
    queryKey: ["conversation-order", orderId],
    queryFn: () => (orderId === undefined ? null : getMyConversationOrder({ data: { orderId } })),
    enabled: orderId !== undefined,
  });

export const myConversationOrdersQueryOptions = (storeConnectionId: string, query: string) =>
  queryOptions({
    queryKey: ["conversation-orders", storeConnectionId, query],
    queryFn: () =>
      listMyConversationOrders({
        data: { storeConnectionId, query: query === "" ? undefined : query },
      }),
    placeholderData: keepPreviousData,
  });
