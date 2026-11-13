import { CheckIcon, CodeIcon, FilePdfIcon, FileTextIcon } from "@phosphor-icons/react";
import { formatAccessKey, INVOICE_STATUS_LABELS } from "@sellbridge/shared/supplier-invoice";
import { TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { invoiceFileLink } from "@/features/fulfillment/invoice-file-link";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { useTabProfileLink } from "@/lib/tab-profile";

export interface ResellerInvoice {
  number: string | null;
  series: string | null;
  accessKey: string | null;
  authorizedAt: Date | null;
}

function numberLabel(invoice: ResellerInvoice): string {
  const number = invoice.number ?? "sem número";
  return invoice.series === null ? `Nota ${number}` : `Nota ${number} · série ${invoice.series}`;
}

function statusLabel(invoice: ResellerInvoice): string {
  const label = INVOICE_STATUS_LABELS.authorized;
  return invoice.authorizedAt === null
    ? label
    : `${label} · ${formatAbsoluteTime(invoice.authorizedAt)}`;
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

/**
 * The NF-e the supplier issued for this parcel, straight to the buyer: its number, key and date,
 * and its two files. Shown once SEFAZ authorized it.
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
          tone="success"
          label={statusLabel(invoice)}
          icon={<CheckIcon aria-hidden="true" className="size-3.5" />}
        />
      </div>
      <InvoiceFacts invoice={invoice} />
      {invoice.accessKey === null ? null : (
        <InvoiceDownloads orderId={orderId} shipmentId={shipmentId} />
      )}
      <p className="text-footnote text-muted-foreground">
        O fornecedor emitiu esta nota direto para o comprador. O DANFE é a nota para imprimir; o XML
        é o arquivo que o contador costuma pedir.
      </p>
    </section>
  );
}
