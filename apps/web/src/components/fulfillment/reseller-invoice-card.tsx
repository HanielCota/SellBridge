import {
  CheckIcon,
  ClockIcon,
  CodeIcon,
  FilePdfIcon,
  FileTextIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import {
  formatAccessKey,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from "@sellbridge/shared/supplier-invoice";
import type { ReactNode } from "react";
import { TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { invoiceFileLink } from "@/features/fulfillment/invoice-file-link";
import { INVOICE_TONES } from "@/features/fulfillment/invoice-tones";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { useTabProfileLink } from "@/lib/tab-profile";

export interface ResellerInvoice {
  status: InvoiceStatus;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  authorizedAt: Date | null;
  updatedAt: Date;
}

const ICONS: Record<InvoiceStatus, ReactNode> = {
  queued: <ClockIcon aria-hidden="true" className="size-3.5" />,
  sent: <ClockIcon aria-hidden="true" className="size-3.5" />,
  authorized: <CheckIcon aria-hidden="true" className="size-3.5" />,
  attention: <WarningIcon aria-hidden="true" className="size-3.5" />,
  cancelled: undefined,
};

/** What the reseller reads while the note is not out; the supplier's reason stays with them. */
const PENDING_TEXT: Record<Exclude<InvoiceStatus, "authorized">, string> = {
  queued:
    "O fornecedor está emitindo a nota deste pacote, direto para o comprador. Quando ela sair, aparece aqui e chega no seu e-mail com o XML e o DANFE.",
  sent: "O fornecedor está emitindo a nota deste pacote, direto para o comprador. Quando ela sair, aparece aqui e chega no seu e-mail com o XML e o DANFE.",
  attention:
    "A nota deste pacote parou no sistema do fornecedor. Ele já foi avisado e precisa corrigir para ela sair. Se demorar, fale com o fornecedor.",
  cancelled: "O fornecedor cancelou esta nota no sistema dele.",
};

function numberLabel(invoice: ResellerInvoice): string {
  const number = invoice.number ?? "sem número";
  return invoice.series === null ? `Nota ${number}` : `Nota ${number} · série ${invoice.series}`;
}

/** "Nota emitida · 10/11/2026 10:42": the status with the moment it reached it. */
function statusLabel(invoice: ResellerInvoice): string {
  const moment = invoice.status === "authorized" ? invoice.authorizedAt : invoice.updatedAt;
  const label = INVOICE_STATUS_LABELS[invoice.status];
  return moment === null ? label : `${label} · ${formatAbsoluteTime(moment)}`;
}

function InvoiceFacts({ invoice }: { invoice: ResellerInvoice }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-subhead sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="text-footnote text-muted-foreground">Número</dt>
        <dd className="font-medium">{numberLabel(invoice)}</dd>
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
  );
}

function InvoiceDownloads({ orderId, shipmentId }: { orderId: string; shipmentId: string }) {
  const withProfile = useTabProfileLink();
  const link = (kind: "xml" | "danfe") =>
    withProfile(invoiceFileLink({ orderId, shipmentId, kind }));
  return (
    <div className="flex flex-wrap gap-2 [&>*]:h-auto [&>*]:min-h-11 [&>*]:max-w-full [&>*]:whitespace-normal">
      <Button asChild variant="outline">
        <a href={link("danfe")} target="_blank" rel="noopener noreferrer">
          <FilePdfIcon aria-hidden="true" />
          Baixar DANFE (PDF)
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={link("xml")} target="_blank" rel="noopener noreferrer">
          <CodeIcon aria-hidden="true" />
          Baixar XML
        </a>
      </Button>
    </div>
  );
}

function AuthorizedBody({
  orderId,
  shipmentId,
  invoice,
}: {
  orderId: string;
  shipmentId: string;
  invoice: ResellerInvoice;
}) {
  return (
    <>
      <InvoiceFacts invoice={invoice} />
      {invoice.accessKey === null ? null : (
        <InvoiceDownloads orderId={orderId} shipmentId={shipmentId} />
      )}
      <p className="text-footnote text-muted-foreground">
        O fornecedor emitiu esta nota direto para o comprador. O DANFE é a nota para imprimir; o XML
        é o arquivo que o contador costuma pedir.
      </p>
    </>
  );
}

/**
 * The NF-e the supplier's ERP issues for this parcel, straight to the buyer: while it is on its
 * way or stopped, what is happening; once SEFAZ authorized it, its number, key, date and files.
 */
export function ResellerInvoiceCard({
  orderId,
  shipmentId,
  invoice,
}: {
  orderId: string;
  shipmentId: string;
  invoice: ResellerInvoice;
}) {
  return (
    <section aria-label="Nota fiscal" className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-subhead font-semibold">
          <FileTextIcon aria-hidden="true" className="size-5" />
          Nota fiscal
        </h3>
        <TonePill
          tone={INVOICE_TONES[invoice.status]}
          label={statusLabel(invoice)}
          icon={ICONS[invoice.status]}
        />
      </div>
      {invoice.status === "authorized" ? (
        <AuthorizedBody orderId={orderId} shipmentId={shipmentId} invoice={invoice} />
      ) : (
        <p className="text-subhead text-muted-foreground">{PENDING_TEXT[invoice.status]}</p>
      )}
    </section>
  );
}
