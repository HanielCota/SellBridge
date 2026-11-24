import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { resumeReconnectedStoreFn } from "@/features/listings/listings.functions";
import { resumeOutcomeMessage } from "@/features/listings/resume-messages";
import { errorMessage } from "@/lib/errors";

/** "Reativar os anúncios" after reconnecting a store: resumes them and reports the outcome. */
export function useReconnectResume(onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeConnectionId: string) =>
      resumeReconnectedStoreFn({ data: { storeConnectionId } }),
    onSuccess: async (outcome) => {
      const description = resumeOutcomeMessage(outcome);
      if (outcome.held > 0) {
        toast.warning("Alguns anúncios continuam pausados", { description });
      }
      if (outcome.held === 0) {
        toast.success("Anúncios reativados", { description });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stores"] }),
        queryClient.invalidateQueries({ queryKey: ["listings"] }),
      ]);
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
