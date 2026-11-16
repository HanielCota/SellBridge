import type { PaymentProviderName } from "@sellbridge/shared/payment-accounts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { chooseReceivingProviderFn } from "@/features/supplier-payments/asaas.functions";
import { asaasReceivingQueryOptions } from "@/features/supplier-payments/asaas.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { AsaasReceivingView } from "./asaas-receiving-card";
import { RECEIVING_PROVIDER_COPY, switchTarget } from "./receiving-switch";

const MARK_COLORS: Readonly<Record<PaymentProviderName, string>> = {
  mercado_pago: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  asaas: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

interface Switch {
  provider: PaymentProviderName;
  /** Where the payments went before, so the notice can undo it; null on the undo itself. */
  previous: PaymentProviderName | null;
}

function useSwitch(supplierId: string, onDone: () => void) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ provider }: Switch) =>
      chooseReceivingProviderFn({ data: { supplierId, provider } }),
    onSuccess: async (_result, { provider, previous }) => {
      onDone();
      const message = `Pronto. Os próximos pagamentos vão para o ${RECEIVING_PROVIDER_COPY[provider].name}.`;
      if (previous === null) {
        toast.success(message);
      }
      if (previous !== null) {
        toast.success(message, {
          action: {
            label: "Desfazer",
            onClick: () => mutation.mutate({ provider: previous, previous: null }),
          },
        });
      }
      await queryClient.invalidateQueries({
        queryKey: asaasReceivingQueryOptions(supplierId).queryKey,
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return mutation;
}

function CurrentProvider({ provider }: { provider: PaymentProviderName }) {
  const copy = RECEIVING_PROVIDER_COPY[provider];
  return (
    <div className="flex items-center gap-3.5">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-11 flex-none place-items-center rounded-2xl text-sm font-bold",
          MARK_COLORS[provider],
        )}
      >
        {copy.mark}
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="font-medium">{copy.name}</p>
        <p className="text-sm text-muted-foreground">{copy.detail}</p>
      </div>
    </div>
  );
}

function SwitchButton(props: {
  supplierId: string;
  current: PaymentProviderName;
  target: PaymentProviderName;
}) {
  const [asking, setAsking] = useState(false);
  const change = useSwitch(props.supplierId, () => setAsking(false));
  const name = RECEIVING_PROVIDER_COPY[props.target].name;
  return (
    <div>
      <Button variant="outline" size="lg" onClick={() => setAsking(true)}>
        Trocar para o {name}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Trocar para o ${name}?`}
        description={RECEIVING_PROVIDER_COPY[props.target].switchConsequence}
        confirmLabel={`Trocar para o ${name}`}
        pendingLabel="Trocando…"
        isPending={change.isPending}
        onConfirm={() => change.mutate({ provider: props.target, previous: props.current })}
      />
    </div>
  );
}

/**
 * Where the next payments go, once both accounts can receive. Switching asks first, with what
 * changes, and the notice offers to undo it: only new payments move, what was paid stays put.
 */
export function ReceivingChoice({
  supplierId,
  view,
}: {
  supplierId: string;
  view: AsaasReceivingView;
}) {
  const current = view.receivingProvider;
  if (!view.mercadoPagoUsable || !view.asaasUsable || current === null) {
    return null;
  }
  const target = switchTarget({ ...view, current });
  return (
    <section
      aria-labelledby="receiving-choice-title"
      className="surface-card grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1">
        <h2 id="receiving-choice-title" className="text-subhead font-medium">
          Para onde vão os próximos pagamentos
        </h2>
        <p className="text-sm text-muted-foreground">O que já foi pago continua onde está.</p>
      </div>
      <CurrentProvider provider={current} />
      {target === null ? (
        <p className="text-sm text-muted-foreground">
          Até completar as primeiras entregas, você recebe pelo Asaas.
        </p>
      ) : (
        <SwitchButton supplierId={supplierId} current={current} target={target} />
      )}
    </section>
  );
}
