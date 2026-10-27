import type {
  StaffTicketsSearch,
  SupportPerformanceInput,
  TicketsSearch,
} from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getMySupportOverview,
  getMyTicket,
  listMyColleagues,
  listMyLinkableOrders,
  listMyTickets,
  listSupportTeam,
  staffGetTicket,
  staffListTickets,
  staffQueueCounts,
  staffSupportPerformance,
} from "./support.functions";

/** An open thread picks up the other side's new messages without a reload. */
const THREAD_REFRESH_MILLISECONDS = 15_000;
const LIST_REFRESH_MILLISECONDS = 30_000;
const OVERVIEW_REFRESH_MILLISECONDS = 60_000;

// Every key starts with "tickets", so one invalidation after any change refreshes them all.
export const myTicketsQueryOptions = (search: TicketsSearch) =>
  queryOptions({
    queryKey: ["tickets", "mine", search],
    queryFn: () => listMyTickets({ data: search }),
    placeholderData: keepPreviousData,
    refetchInterval: LIST_REFRESH_MILLISECONDS,
  });

export const mySupportOverviewQueryOptions = () =>
  queryOptions({
    queryKey: ["tickets", "mine", "overview"],
    queryFn: () => getMySupportOverview(),
    refetchInterval: OVERVIEW_REFRESH_MILLISECONDS,
  });

export const myTicketQueryOptions = (ticketId: string) =>
  queryOptions({
    queryKey: ["tickets", "mine", "detail", ticketId],
    queryFn: () => getMyTicket({ data: { ticketId } }),
    refetchInterval: THREAD_REFRESH_MILLISECONDS,
  });

export const staffTicketsQueryOptions = (search: StaffTicketsSearch) =>
  queryOptions({
    queryKey: ["tickets", "admin", search],
    queryFn: () => staffListTickets({ data: search }),
    placeholderData: keepPreviousData,
    refetchInterval: LIST_REFRESH_MILLISECONDS,
  });

export const staffQueueCountsQueryOptions = () =>
  queryOptions({
    queryKey: ["tickets", "admin", "queues"],
    queryFn: () => staffQueueCounts(),
    refetchInterval: LIST_REFRESH_MILLISECONDS,
  });

export const staffTicketQueryOptions = (ticketId: string) =>
  queryOptions({
    queryKey: ["tickets", "admin", "detail", ticketId],
    queryFn: () => staffGetTicket({ data: { ticketId } }),
    refetchInterval: THREAD_REFRESH_MILLISECONDS,
  });

export const supportTeamQueryOptions = () =>
  queryOptions({
    queryKey: ["support-team"],
    queryFn: () => listSupportTeam(),
    staleTime: 5 * 60_000,
  });

export const supportPerformanceQueryOptions = (input: SupportPerformanceInput) =>
  queryOptions({
    queryKey: ["tickets", "admin", "performance", input.period, input.from, input.to, input.origem],
    queryFn: () => staffSupportPerformance({ data: input }),
    placeholderData: keepPreviousData,
  });

export const myLinkableOrdersQueryOptions = (ticketId: string, query: string) =>
  queryOptions({
    queryKey: ["tickets", "mine", "linkable-orders", ticketId, query],
    queryFn: () => listMyLinkableOrders({ data: { ticketId, query: query || undefined } }),
    placeholderData: keepPreviousData,
  });

export const myColleaguesQueryOptions = () =>
  queryOptions({
    queryKey: ["tenant-colleagues"],
    queryFn: () => listMyColleagues(),
    staleTime: 5 * 60_000,
  });
