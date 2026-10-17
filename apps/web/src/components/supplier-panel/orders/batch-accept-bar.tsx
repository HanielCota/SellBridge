import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SelectionBar } from "@/components/data/selection-bar";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { BatchAcceptReport } from "@/features/supplier-panel/orders/batch-accept";
import {
  type SupplierOrderRow,
  useBatchAccept,
} from "@/features/supplier-panel/orders/use-order-actions";
import { errorMessage } from "@/lib/errors";

type Selected = Pick<SupplierOrderRow, "id" | "externalOrderId">;

/** The selected orders, listed in the confirmation so nothing is accepted unseen. */
function SelectedOrders({ selected }: { selected: readonly Selected[] }) {
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-muted/50 p-3 text-subhead">
      {selected.map((row) => (
        <li key={row.id} className="break-all">
          Pedido {row.externalOrderId}
        </li>
      ))}
    </ul>
  );
}

/** After the batch: how many went through and, for each one that did not, the reason. */
export function BatchAcceptResult({
  report,
  orderNumbers,
  onDismiss,
}: {
  report: BatchAcceptReport;
  orderNumbers: ReadonlyMap<string, string>;
  onDismiss: () => void;
}) {
  const failures = report.results.filter((result) => !result.accepted);
  const allAccepted = failures.length === 0;
  const Icon = allAccepted ? CheckCircleIcon : XCircleIcon;
  return (
    <output className="block">
      <Alert variant={allAccepted ? "default" : "destructive"}>
        <Icon aria-hidden="true" />
        <AlertTitle>
          {report.acceptedCount} {report.acceptedCount === 1 ? "pedido aceito" : "pedidos aceitos"}
          {allAccepted
            ? ""
            : `, ${report.failedCount} não ${report.failedCount === 1 ? "foi" : "foram"}`}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          {failures.length === 0 ? null : (
            <ul className="space-y-1">
              {failures.map((failure) => (
                <li key={failure.shipmentId}>
                  <span className="font-medium">
                    Pedido {orderNumbers.get(failure.shipmentId) ?? failure.shipmentId}:
                  </span>{" "}
                  {failure.reason}
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="outline" onClick={onDismiss}>
            Entendi
          </Button>
        </AlertDescription>
      </Alert>
    </output>
  );
}

/** Floating bar for the selected orders: accept them all, after a confirmation that lists them. */
export function BatchAcceptBar({
  supplierId,
  selected,
  onClear,
  onDone,
}: {
  supplierId: string;
  selected: readonly Selected[];
  onClear: () => void;
  onDone: (report: BatchAcceptReport, orderNumbers: ReadonlyMap<string, string>) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const batch = useBatchAccept(supplierId);
  const count = selected.length;
  const confirm = () => {
    const orderNumbers = new Map(selected.map((row) => [row.id, row.externalOrderId]));
    batch.mutate(
      selected.map((row) => row.id),
      {
        onSuccess: (report) => {
          setConfirming(false);
          onDone(report, orderNumbers);
        },
      },
    );
  };
  return (
    <>
      <SelectionBar
        label="Pedidos selecionados"
        count={count}
        countLabel={{ one: "selecionado", other: "selecionados" }}
        onClear={onClear}
      >
        <Button size="sm" className="rounded-full" onClick={() => setConfirming(true)}>
          Aceitar {count === 1 ? "pedido" : "pedidos"}
        </Button>
      </SelectionBar>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={count === 1 ? "Aceitar 1 pedido?" : `Aceitar ${count} pedidos?`}
        description="O aceite fica no histórico de cada pedido e o revendedor passa a contar com o despacho no seu prazo. Ele não pode ser desfeito por aqui."
        confirmLabel={count === 1 ? "Aceitar pedido" : `Aceitar ${count} pedidos`}
        pendingLabel="Aceitando…"
        isPending={batch.isPending}
        onConfirm={confirm}
      >
        <SelectedOrders selected={selected} />
        {batch.isError ? (
          <p className="text-subhead text-destructive" role="alert">
            {errorMessage(batch.error)}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
