import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { closeMyTicket } from "@/features/support/support.functions";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

/** Long enough to notice a wrong tap on a phone, short enough that the close feels instant. */
export const CLOSE_UNDO_MILLISECONDS = 5000;

/** The words "Não" sends; support reads them in the thread like any reply. */
export const NOT_SOLVED_MESSAGE = "Ainda não resolveu.";

/**
 * "Sim, resolveu" waits a few seconds before closing, with "Desfazer" on the notice: the two
 * buttons sit side by side on phones. Leaving the page inside that window closes right away.
 */
export function useCloseWithUndo(ticketId: string) {
  const queryClient = useQueryClient();
  const timerRef = useRef<number | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const close = useMutation({
    mutationFn: () => closeMyTicket({ data: { ticketId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const closeNow = close.mutate;

  useEffect(
    () => () => {
      if (timerRef.current === null) {
        return;
      }
      window.clearTimeout(timerRef.current);
      closeNow();
    },
    [closeNow],
  );

  function cancel() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = null;
    setIsScheduled(false);
  }

  function schedule() {
    setIsScheduled(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setIsScheduled(false);
      closeNow();
    }, CLOSE_UNDO_MILLISECONDS);
    toast("Chamado encerrado", {
      duration: CLOSE_UNDO_MILLISECONDS,
      action: { label: "Desfazer", onClick: cancel },
    });
  }

  return { schedule, isBusy: isScheduled || close.isPending };
}

/**
 * "Não" tells support at once, instead of only filling the box: a ticket left answered closes
 * on its own after a week, even if the customer believes they replied.
 */
export function useNotSolved(ticketId: string, onSent: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.set("body", NOT_SOLVED_MESSAGE);
      await postMultipart(`/api/suporte/chamados/${ticketId}/mensagens`, formData);
    },
    onSuccess: async () => {
      toast.success("Avisamos o suporte que ainda não resolveu");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
      onSent();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
