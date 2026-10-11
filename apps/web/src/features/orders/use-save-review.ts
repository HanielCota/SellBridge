import type { SupplierReviewInput } from "@sellbridge/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";
import { notificationsQueryOptions } from "@/features/notifications/notifications.queries";
import { saveSupplierReviewFn } from "./orders.functions";

/** Every cache a review changes: the order list, the pending counters and the scores. */
const AFFECTED_KEYS = [
  ["order-reviews"],
  ["suppliers"],
  ["supplier-reputation"],
  attentionCountsQueryOptions().queryKey,
  notificationsQueryOptions().queryKey,
] as const;

export function useSaveReview(onSaved: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (review: SupplierReviewInput) => saveSupplierReviewFn({ data: review }),
    onSuccess: async () => {
      toast.success("Avaliação enviada");
      onSaved();
      await Promise.all(
        AFFECTED_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
