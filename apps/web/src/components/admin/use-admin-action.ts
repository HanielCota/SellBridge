import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

/** Runs an admin action, confirms it with a toast and refreshes every customer view. */
export function useAdminAction<TInput>(
  action: (input: TInput) => Promise<unknown>,
  successMessage: string,
  onSuccess?: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      toast.success(successMessage);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      onSuccess?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
