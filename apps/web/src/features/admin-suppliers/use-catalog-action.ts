import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

/** Long enough to read the notice and reach "Desfazer" (WCAG 2.2.1). */
const UNDO_NOTICE_MILLISECONDS = 10_000;

/**
 * Runs a catalog write, says what it did and refreshes the catalog views. With `undoInput`, the
 * notice offers "Desfazer", which runs the same action with the input it returns.
 */
export function useCatalogAction<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  message: string | ((result: TResult) => string),
  onSuccess?: (result: TResult) => void,
  undoInput?: (input: TInput, result: TResult) => TInput | null,
) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: action,
    onSuccess: async (result, input) => {
      const undo = undoInput?.(input, result) ?? null;
      toast.success(
        typeof message === "string" ? message : message(result),
        undo === null
          ? undefined
          : {
              duration: UNDO_NOTICE_MILLISECONDS,
              action: { label: "Desfazer", onClick: () => mutation.mutate(undo) },
            },
      );
      if (
        typeof result === "object" &&
        result !== null &&
        "synchronizationQueued" in result &&
        result.synchronizationQueued === false
      ) {
        toast.warning(
          "Catálogo salvo. As lojas recebem a mudança na próxima atualização automática.",
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] }),
        queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
        queryClient.invalidateQueries({ queryKey: ["supplier-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["sellable-catalog"] }),
      ]);
      onSuccess?.(result);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return mutation;
}
