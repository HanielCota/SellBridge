import { ClockIcon, FlaskIcon, PrinterIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { DotTimeline, DotTimelineItem } from "@/components/data/dot-timeline";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type SupplierTestOrderView,
  supplierTestOrderQueryOptions,
  useTestOrderActions,
} from "@/features/supplier-panel/test-order/test-order.queries";
import {
  testOrderAwaitsPosting,
  testOrderNextAction,
  testOrderTimeline,
} from "@/features/supplier-panel/test-order/test-order-steps";
import { errorMessage } from "@/lib/errors";
import { formatDeadline } from "@/lib/relative-time";

/** The one mark every test order carries, so it is never taken for a real sale. */
function TestOrderBadge() {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-sky-100 px-2.5 text-xs font-semibold text-sky-900 dark:bg-sky-500/25 dark:text-sky-100">
      <FlaskIcon weight="bold" aria-hidden="true" className="size-3.5" />
      Pedido de teste
    </span>
  );
}

const SAFE_PROMISE =
  "Nada vai para o Mercado Livre, ninguém é cobrado e nada entra nos relatórios.";

function NoTestOrder({ supplierId }: { supplierId: string }) {
  const { create } = useTestOrderActions(supplierId);
  return (
    <section
      aria-label="Pedido de teste"
      className="surface-card flex flex-col gap-3 rounded-3xl bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-1">
        <h2 className="font-medium">Quer ver como um pedido anda?</h2>
        <p className="text-sm text-muted-foreground">
          Crie um pedido de teste e siga as etapas: aceitar, etiqueta, separar e enviar.{" "}
          {SAFE_PROMISE}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="shrink-0 max-sm:w-full"
        disabled={create.isPending}
        onClick={() => create.mutate()}
      >
        <FlaskIcon aria-hidden="true" />
        {create.isPending ? "Criando..." : "Criar pedido de teste"}
      </Button>
    </section>
  );
}

/** A sample of the label the supplier would print, marked so it never goes on a parcel. */
function TestLabelDialog({
  order,
  open,
  onOpenChange,
}: {
  order: SupplierTestOrderView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Etiqueta de teste</DialogTitle>
          <DialogDescription>
            Num pedido de verdade, a etiqueta do Mercado Livre sai aqui para imprimir e colar na
            caixa. Esta é só um exemplo.
          </DialogDescription>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-foreground/40 bg-white p-4 font-mono text-sm text-black">
          <p
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex -rotate-12 items-center justify-center text-5xl font-black tracking-widest text-red-600/25"
          >
            TESTE
          </p>
          <p className="font-bold">NÃO VALE PARA ENVIO</p>
          <p className="mt-3">Destinatário: Comprador de teste</p>
          <p>Rua de Exemplo, 100 · São Paulo - SP</p>
          <p className="mt-3">
            {order.productTitle} · SKU {order.productSku}
          </p>
          <p>Quantidade: 1</p>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function PostingDeadline({ order }: { order: SupplierTestOrderView }) {
  if (!testOrderAwaitsPosting(order.step)) {
    return null;
  }
  return (
    <p className="flex items-center gap-1.5 text-sm" suppressHydrationWarning>
      <ClockIcon weight="bold" aria-hidden="true" className="size-4 text-muted-foreground" />
      Postar até {formatDeadline(order.dispatchDeadlineAt)}
    </p>
  );
}

function TestOrderSteps({ order }: { order: SupplierTestOrderView }) {
  const steps = testOrderTimeline(order);
  return (
    <DotTimeline label="Etapas do pedido de teste">
      {steps.map((step) =>
        step.at === null ? (
          <li
            key={step.step}
            className="relative grid grid-cols-[7px_minmax(0,1fr)] gap-3 text-footnote text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 size-[7px] rounded-full bg-border ring-2 ring-card"
            />
            {step.label}
          </li>
        ) : (
          <DotTimelineItem key={step.step} dotClassName={TONE_DOT_CLASSES.success} date={step.at}>
            {step.label}
          </DotTimelineItem>
        ),
      )}
    </DotTimeline>
  );
}

function TestOrderHeader({
  order,
  deleting,
  disabled,
  onDelete,
}: {
  order: SupplierTestOrderView;
  deleting: boolean;
  disabled: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <TestOrderBadge />
        <h2 className="font-medium wrap-anywhere">{order.productTitle}</h2>
        <p className="text-sm text-muted-foreground">
          SKU {order.productSku} · Comprador de teste · {SAFE_PROMISE}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onDelete}>
        <TrashIcon aria-hidden="true" />
        {deleting ? "Apagando..." : "Apagar pedido de teste"}
      </Button>
    </div>
  );
}

/** The next step's button, or the closing line once delivered, plus the label once printed. */
function TestOrderNextStep({
  order,
  saving,
  disabled,
  onAdvance,
  onShowLabel,
}: {
  order: SupplierTestOrderView;
  saving: boolean;
  disabled: boolean;
  onAdvance: () => void;
  onShowLabel: () => void;
}) {
  const nextAction = testOrderNextAction(order.step);
  return (
    <div className="flex flex-wrap gap-2">
      {nextAction === null ? (
        <p className="text-sm">
          Pronto: é assim que um pedido de verdade anda. Pode apagar este teste.
        </p>
      ) : (
        <Button type="button" className="max-sm:w-full" disabled={disabled} onClick={onAdvance}>
          {order.step === "accepted" ? <PrinterIcon aria-hidden="true" /> : null}
          {saving ? "Salvando..." : nextAction}
        </Button>
      )}
      {order.labelPrintedAt === null ? null : (
        <Button type="button" variant="outline" className="max-sm:w-full" onClick={onShowLabel}>
          Ver etiqueta de teste
        </Button>
      )}
    </div>
  );
}

function ActiveTestOrder({
  supplierId,
  order,
}: {
  supplierId: string;
  order: SupplierTestOrderView;
}) {
  const { advance, remove } = useTestOrderActions(supplierId);
  const [labelOpen, setLabelOpen] = useState(false);
  const busy = advance.isPending || remove.isPending;

  function advanceStep() {
    const printsLabel = order.step === "accepted";
    advance.mutate(
      { testOrderId: order.id, from: order.step },
      {
        onSuccess: () => {
          if (printsLabel) {
            setLabelOpen(true);
          }
        },
      },
    );
  }

  return (
    <section
      aria-label="Pedido de teste"
      className="surface-card space-y-4 rounded-3xl bg-card p-5 ring-2 ring-sky-500/40"
    >
      <TestOrderHeader
        order={order}
        deleting={remove.isPending}
        disabled={busy}
        onDelete={() => remove.mutate(order.id)}
      />
      <PostingDeadline order={order} />
      <TestOrderSteps order={order} />
      <TestOrderNextStep
        order={order}
        saving={advance.isPending}
        disabled={busy}
        onAdvance={advanceStep}
        onShowLabel={() => setLabelOpen(true)}
      />
      <TestLabelDialog order={order} open={labelOpen} onOpenChange={setLabelOpen} />
    </section>
  );
}

/**
 * The supplier's simulated order on top of Pedidos: an invitation to create one, or the test
 * order itself walking the same steps as a real one, clearly marked as a test.
 */
export function TestOrderCard({ supplierId }: { supplierId: string }) {
  const query = useQuery(supplierTestOrderQueryOptions(supplierId));
  if (query.isPending) {
    return <Skeleton className="h-28 rounded-3xl" aria-label="Carregando pedido de teste" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data === null) {
    return <NoTestOrder supplierId={supplierId} />;
  }
  return <ActiveTestOrder supplierId={supplierId} order={query.data} />;
}
