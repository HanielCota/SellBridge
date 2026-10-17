import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * The ticket queries whose unread counts change when a thread is read: every list and queue,
 * but not a thread itself (`["tickets", side, "detail", id]`). Reading it changes nothing on
 * screen, so refetching it only doubled each open.
 */
export function isUnreadCountQuery(queryKey: QueryKey): boolean {
  return queryKey[0] === "tickets" && queryKey[2] !== "detail";
}

/**
 * Marks the thread as read up to the newest message on screen whenever one shows up, then
 * refreshes the places that count unread replies (support button, nav badges, notifications).
 */
export function useMarkTicketRead(
  ticketId: string,
  latestMessageId: string | undefined,
  markRead: (input: { data: { ticketId: string; lastMessageId: string } }) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: (lastMessageId: string) => markRead({ data: { ticketId, lastMessageId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["tickets"],
          predicate: (query) => isUnreadCountQuery(query.queryKey),
        }),
        queryClient.invalidateQueries({ queryKey: ["listings", "tickets", "attention-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });
  useEffect(() => {
    if (!latestMessageId) {
      return;
    }
    mutate(latestMessageId);
  }, [latestMessageId, mutate]);
}
