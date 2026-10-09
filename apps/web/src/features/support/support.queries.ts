import type { TicketsSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { adminGetTicket, adminListTickets, getMyTicket, listMyTickets } from "./support.functions";

export const myTicketsQueryOptions = (search: TicketsSearch) =>
  queryOptions({
    queryKey: ["tickets", "mine", search],
    queryFn: () => listMyTickets({ data: search }),
    placeholderData: keepPreviousData,
  });

export const myTicketQueryOptions = (ticketId: string) =>
  queryOptions({
    queryKey: ["tickets", "mine", "detail", ticketId],
    queryFn: () => getMyTicket({ data: { ticketId } }),
  });

export const adminTicketsQueryOptions = (search: TicketsSearch) =>
  queryOptions({
    queryKey: ["tickets", "admin", search],
    queryFn: () => adminListTickets({ data: search }),
    placeholderData: keepPreviousData,
  });

export const adminTicketQueryOptions = (ticketId: string) =>
  queryOptions({
    queryKey: ["tickets", "admin", "detail", ticketId],
    queryFn: () => adminGetTicket({ data: { ticketId } }),
  });
