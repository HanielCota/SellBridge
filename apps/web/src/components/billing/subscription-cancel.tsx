import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DisabledHint } from "@/components/ui/hint";
import { cancelBilling, quoteBillingCancellation } from "@/features/billing/billing.functions";
import { billingQueryOptions } from "@/features/billing/billing.queries";
import { errorMessage } from "@/lib/errors";
import { OWNER_ONLY_REASON, type BillingData } from "./billing-data";
import { cancelCopy, cancelledMessage } from "./billing-copy";

/**
 * "Cancelar assinatura" with its consequence written first. `askNow` opens it on arrival, as
 * "Só cancelar o plano" in the account deletion does.
 */
export function SubscriptionCancel({ data, askNow }: { data: BillingData; askNow: boolean }) {
  const [open, setOpen] = useState(askNow && data.canManage);
  const queryClient = useQueryClient();
  const terms = useQuery({
    queryKey: ["billing", "cancel-terms"],
    queryFn: async () => quoteBillingCancellation(),
    enabled: open,
    staleTime: 0,
  });
  const cancel = useMutation({
    mutationFn: async () => cancelBilling(),
    onSuccess: async (result) => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: billingQueryOptions().queryKey });
      toast.success(cancelledMessage(result));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const waiting = terms.isError ? errorMessage(terms.error) : "Conferindo a sua assinatura...";
  const button = (
    <Button
      variant="ghost"
      className="h-11 w-full text-destructive sm:w-auto"
      disabled={!data.canManage}
      onClick={() => setOpen(true)}
    >
      Cancelar assinatura
    </Button>
  );
  return (
    <>
      {data.canManage ? button : <DisabledHint reason={OWNER_ONLY_REASON}>{button}</DisabledHint>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancelar a assinatura"
        description={terms.data === undefined ? waiting : cancelCopy(terms.data)}
        confirmLabel="Cancelar assinatura"
        pendingLabel={cancel.isPending ? "Cancelando..." : "Aguarde..."}
        cancelLabel="Manter assinatura"
        destructive
        isPending={cancel.isPending || terms.data === undefined}
        onConfirm={() => cancel.mutate()}
      />
    </>
  );
}
