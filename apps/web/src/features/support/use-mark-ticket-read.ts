import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

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
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
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
