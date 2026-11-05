import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { SelectionBar } from "@/components/data/selection-bar";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { BatchAcceptReport } from "@/features/supplier-panel/orders/batch-accept";
import type { BatchLabelsReport } from "@/features/supplier-panel/orders/batch-labels";
import {
  type SupplierOrderRow,
  useBatchAccept,
  useBatchLabels,
} from "@/features/supplier-panel/orders/use-order-actions";
import { errorMessage } from "@/lib/errors";
import { isBatchAcceptable, isLabelPrintable } from "./order-row-parts";

type Selected = Pick<SupplierOrderRow, "id" | "externalOrderId">;

function orderNumbersOf(rows: readonly Selected[]): ReadonlyMap<string, string> {
  return new Map(rows.map((row) => [row.id, row.externalOrderId]));
}

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
            Fechar
          </Button>
        </AlertDescription>
      </Alert>
    </output>
  );
}

/** Prints the labels of the selected orders that have one: no confirmation, nothing is moved. */
function PrintLabelsButton({
  supplierId,
  printable,
  onDone,
}: {
  supplierId: string;
  printable: readonly Selected[];
  onDone: (report: BatchLabelsReport, orderNumbers: ReadonlyMap<string, string>) => void;
}) {
  const labels = useBatchLabels(supplierId);
  if (printable.length === 0) {
    return null;
  }
  const print = () => {
    const orderNumbers = orderNumbersOf(printable);
    labels.mutate(
      printable.map((row) => row.id),
      {
        onSuccess: (report) => onDone(report, orderNumbers),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full"
      disabled={labels.isPending}
      // The phone shows the short word; the name stays whole for screen readers.
      aria-label={labels.isPending ? undefined : `Imprimir etiquetas (${printable.length})`}
      onClick={print}
    >
      {labels.isPending ? (
        "Gerando…"
      ) : (
        <>
          <span aria-hidden="true" className="sm:hidden">{`Etiquetas (${printable.length})`}</span>
          <span aria-hidden="true" className="hidden sm:inline">
            {`Imprimir etiquetas (${printable.length})`}
          </span>
        </>
      )}
    </Button>
  );
}

/** Accepts the selected orders waiting for it, after a confirmation that lists them. */
function AcceptButton({
  supplierId,
  acceptable,
  onDone,
}: {
  supplierId: string;
  acceptable: readonly Selected[];
  onDone: (report: BatchAcceptReport, orderNumbers: ReadonlyMap<string, string>) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const batch = useBatchAccept(supplierId);
  const count = acceptable.length;
  if (count === 0) {
    return null;
  }
  const confirm = () => {
    const orderNumbers = orderNumbersOf(acceptable);
    batch.mutate(
      acceptable.map((row) => row.id),
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
      <Button size="sm" className="rounded-full" onClick={() => setConfirming(true)}>
        {`Aceitar (${count})`}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={count === 1 ? "Aceitar 1 pedido?" : `Aceitar ${count} pedidos?`}
        description="O aceite fica no histórico e não pode ser desfeito."
        confirmLabel={count === 1 ? "Aceitar pedido" : `Aceitar ${count} pedidos`}
        pendingLabel="Aceitando…"
        isPending={batch.isPending}
        onConfirm={confirm}
      >
        <SelectedOrders selected={acceptable} />
        {batch.isError ? (
          <p className="text-subhead text-destructive" role="alert">
            {errorMessage(batch.error)}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

/**
 * Floating bar for the selected orders: print the labels of those that have one, and accept
 * those waiting for it.
 */
export function BatchAcceptBar({
  supplierId,
  selected,
  onClear,
  onDone,
  onLabelsDone,
}: {
  supplierId: string;
  selected: readonly SupplierOrderRow[];
  onClear: () => void;
  onDone: (report: BatchAcceptReport, orderNumbers: ReadonlyMap<string, string>) => void;
  onLabelsDone: (report: BatchLabelsReport, orderNumbers: ReadonlyMap<string, string>) => void;
}) {
  return (
    <SelectionBar
      label="Pedidos selecionados"
      count={selected.length}
      countLabel={{ one: "selecionado", other: "selecionados" }}
      onClear={onClear}
    >
      <PrintLabelsButton
        supplierId={supplierId}
        printable={selected.filter(isLabelPrintable)}
        onDone={onLabelsDone}
      />
      <AcceptButton
        supplierId={supplierId}
        acceptable={selected.filter(isBatchAcceptable)}
        onDone={onDone}
      />
    </SelectionBar>
  );
}
