import { formatCents } from "@sellbridge/shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { decideHeldPaymentFn } from "@/features/supplier-payments/asaas.functions";
import { heldPaymentDecisionQueryOptions } from "@/features/supplier-payments/asaas.queries";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

type Decision = "release" | "refund";

const COPY: Readonly<
  Record<Decision, { button: string; title: string; consequence: (amount: string) => string }>
> = {
  refund: {
    button: "Devolver ao revendedor",
    title: "Devolver o pagamento ao revendedor?",
    consequence: (amount) =>
      `${amount} voltam para o revendedor pelo Asaas nos próximos minutos. Depois que o Asaas devolver, não dá para desfazer.`,
  },
  release: {
    button: "Liberar ao fornecedor",
    title: "Liberar o pagamento ao fornecedor?",
    consequence: (amount) =>
      `${amount} vão para a conta do fornecedor no Asaas nos próximos minutos. Depois de liberado, não dá para desfazer.`,
  },
};

function DecidedLine({ view }: { view: { decision: Decision | null; decidedAt: string | null } }) {
  const when = view.decidedAt === null ? "" : ` em ${formatAbsoluteTime(new Date(view.decidedAt))}`;
  const what = view.decision === "refund" ? "devolver ao revendedor" : "liberar ao fornecedor";
  return (
    <p className="text-sm">{`A equipe decidiu ${what}${when}. O SellBridge cuida do resto.`}</p>
  );
}

type DecisionView = {
  amountCents: number;
  decidable: boolean;
  decision: Decision | null;
  decidedAt: string | null;
  released: boolean;
};

function CurrentState({ view }: { view: DecisionView }) {
  if (view.decision !== null) {
    return <DecidedLine view={view} />;
  }
  return (
    <p className="text-sm">
      {view.released
        ? "O dinheiro já foi liberado ao fornecedor."
        : "O dinheiro já voltou (ou está voltando) ao revendedor."}
    </p>
  );
}

function useDecide(shipmentPaymentId: string, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: Decision) =>
      decideHeldPaymentFn({ data: { shipmentPaymentId, decision } }),
    onSuccess: (view) => {
      onDone();
      queryClient.setQueryData(heldPaymentDecisionQueryOptions(shipmentPaymentId).queryKey, view);
      toast.success("Decisão registrada. O Asaas recebe o pedido nos próximos minutos.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function DecisionButtons(props: { shipmentPaymentId: string; amount: string }) {
  const [asked, setAsked] = useState<Decision | null>(null);
  const decide = useDecide(props.shipmentPaymentId, () => setAsked(null));
  const copy = asked === null ? null : COPY[asked];
  return (
    <>
      <p className="text-sm text-muted-foreground">
        O dinheiro está guardado no Asaas. Escolha para onde ele vai.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={() => setAsked("refund")}>
          {COPY.refund.button}
        </Button>
        <Button variant="outline" size="lg" onClick={() => setAsked("release")}>
          {COPY.release.button}
        </Button>
      </div>
      <ConfirmDialog
        open={copy !== null}
        onOpenChange={(open) => setAsked(open ? asked : null)}
        title={copy?.title ?? ""}
        description={copy?.consequence(props.amount) ?? ""}
        confirmLabel={copy?.button ?? ""}
        pendingLabel="Registrando…"
        isPending={decide.isPending}
        destructive
        onConfirm={() => {
          if (asked !== null) {
            decide.mutate(asked);
          }
        }}
      />
    </>
  );
}

/**
 * The two buttons for a protected payment no rule decides (an open return, or Asaas's deadline
 * close with no confirmed delivery): the team gives the money back or frees it to the supplier.
 */
export function HeldPaymentDecision({ shipmentPaymentId }: { shipmentPaymentId: string }) {
  const query = useQuery(heldPaymentDecisionQueryOptions(shipmentPaymentId));
  if (query.isPending) {
    return <Skeleton className="h-28 rounded-3xl" />;
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{errorMessage(query.error)}</p>;
  }
  const amount = formatCents(query.data.amountCents);
  return (
    <section className="surface-card grid gap-3 rounded-3xl bg-card p-5">
      <h2 className="text-subhead font-medium">Pagamento protegido de {amount}</h2>
      {query.data.decidable ? (
        <DecisionButtons shipmentPaymentId={shipmentPaymentId} amount={amount} />
      ) : (
        <CurrentState view={query.data} />
      )}
    </section>
  );
}
