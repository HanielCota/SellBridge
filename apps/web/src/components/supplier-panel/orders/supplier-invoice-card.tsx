import {
  ArrowClockwiseIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  PrinterIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import {
  formatAccessKey,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from "@sellbridge/shared/supplier-invoice";
import type { ReactNode } from "react";
import { type StatusTone, TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { SUPPLIER_PANEL_BASE_PATH } from "@/features/supplier-panel/home/attention-links";
import { useRetrySupplierInvoice } from "@/features/supplier-panel/orders/use-order-actions";
import { copyToClipboard } from "@/lib/clipboard";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { useTabProfileLink } from "@/lib/tab-profile";

export interface SupplierInvoice {
  status: InvoiceStatus;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  danfeUrl: string | null;
  problem: string | null;
  authorizedAt: Date | null;
  updatedAt: Date;
}

const TONES: Record<InvoiceStatus, StatusTone> = {
  queued: "muted",
  sent: "warning",
  authorized: "success",
  attention: "danger",
  cancelled: "muted",
};

const ICONS: Record<InvoiceStatus, ReactNode> = {
  queued: <ClockIcon aria-hidden="true" className="size-3.5" />,
  sent: <ClockIcon aria-hidden="true" className="size-3.5" />,
  authorized: <CheckIcon aria-hidden="true" className="size-3.5" />,
  attention: <WarningIcon aria-hidden="true" className="size-3.5" />,
  cancelled: undefined,
};

const WAITING_TEXT: Partial<Record<InvoiceStatus, string>> = {
  queued: "O SellBridge está criando o pedido e a nota no seu Bling. Esta tela atualiza sozinha.",
  sent: "A nota já está no seu Bling e foi enviada para a SEFAZ. Costuma levar poucos minutos; esta tela atualiza sozinha.",
  cancelled: "A nota foi cancelada no Bling.",
};

/** "Nota emitida · 10/11/2026 10:42": the status with the moment it reached it. */
function statusLabel(invoice: SupplierInvoice): string {
  const moment = invoice.status === "authorized" ? invoice.authorizedAt : invoice.updatedAt;
  const label = INVOICE_STATUS_LABELS[invoice.status];
  return moment === null ? label : `${label} · ${formatAbsoluteTime(moment)}`;
}

function AuthorizedDetails({ invoice }: { invoice: SupplierInvoice }) {
  const number =
    invoice.series === null ? invoice.number : `${invoice.number} · série ${invoice.series}`;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-subhead sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-footnote text-muted-foreground">Número</dt>
          <dd className="font-medium">{number}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-footnote text-muted-foreground">Para quem</dt>
          <dd className="font-medium">Comprador do pedido</dd>
        </div>
        {invoice.accessKey === null ? null : (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-footnote text-muted-foreground">Chave de acesso</dt>
            <dd className="font-mono text-footnote break-words">
              {formatAccessKey(invoice.accessKey)}
            </dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        {invoice.danfeUrl === null ? null : (
          <Button asChild variant="outline">
            <a href={invoice.danfeUrl} target="_blank" rel="noopener noreferrer">
              <PrinterIcon aria-hidden="true" />
              Imprimir DANFE
            </a>
          </Button>
        )}
        {invoice.accessKey === null ? null : (
          <Button
            variant="outline"
            onClick={() => void copyToClipboard(invoice.accessKey ?? "", "Chave de acesso copiada")}
          >
            <CopyIcon aria-hidden="true" />
            Copiar chave
          </Button>
        )}
      </div>
      <p className="text-footnote text-muted-foreground">
        Emitida pelo seu Bling. Para cancelar, use o Bling.
      </p>
    </div>
  );
}

function ProblemDetails({
  supplierId,
  shipmentId,
  problem,
}: {
  supplierId: string;
  shipmentId: string;
  problem: string | null;
}) {
  const retry = useRetrySupplierInvoice(supplierId);
  const withProfile = useTabProfileLink();
  return (
    <div className="space-y-3">
      <p className="text-subhead">{problem ?? "Abra o pedido no Bling para ver o motivo."}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={retry.isPending}
          onClick={() => retry.mutate(shipmentId)}
        >
          <ArrowClockwiseIcon aria-hidden="true" />
          {retry.isPending ? "Enviando..." : "Tentar de novo"}
        </Button>
        <Button asChild variant="link">
          <a href={withProfile(`${SUPPLIER_PANEL_BASE_PATH}/marca`)}>Abrir Marca</a>
        </Button>
      </div>
      <p className="text-footnote text-muted-foreground">
        Nenhuma nota foi para a SEFAZ. O envio do pedido segue normal.
      </p>
    </div>
  );
}

/**
 * The parcel's NF-e, issued through the supplier's Bling: where it stands, its number, key and
 * DANFE once authorized, and what to fix when it stopped. Hidden while the parcel has none.
 */
export function SupplierInvoiceCard({
  supplierId,
  shipmentId,
  invoice,
}: {
  supplierId: string;
  shipmentId: string;
  invoice: SupplierInvoice | null;
}) {
  if (invoice === null) {
    return null;
  }
  const waiting = WAITING_TEXT[invoice.status];
  return (
    <section aria-label="Nota fiscal" className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-subhead font-semibold">
          <FileTextIcon aria-hidden="true" className="size-5" />
          Nota fiscal
        </h3>
        <TonePill
          tone={TONES[invoice.status]}
          label={statusLabel(invoice)}
          icon={ICONS[invoice.status]}
        />
      </div>
      {invoice.status === "authorized" ? <AuthorizedDetails invoice={invoice} /> : null}
      {invoice.status === "attention" ? (
        <ProblemDetails supplierId={supplierId} shipmentId={shipmentId} problem={invoice.problem} />
      ) : null}
      {waiting === undefined ? null : (
        <p className="text-subhead text-muted-foreground">{waiting}</p>
      )}
    </section>
  );
}
