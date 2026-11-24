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

/**
 * How each supplier note reads on the reseller's order: the direct note, or in venda à ordem the
 * remessa in the box and the reseller's own purchase.
 */
export type ResellerNoteRole = "direct" | "remessa" | "purchase";

interface RoleText {
  readonly title: string;
  readonly recipient: string;
  /** While the note is on its way (queued or sent). */
  readonly coming: string;
  /** Under an authorized note. */
  readonly about: string;
}

const ROLE_TEXTS: Record<ResellerNoteRole, RoleText> = {
  direct: {
    title: "Nota fiscal",
    recipient: "Comprador do pedido",
    coming:
      "O fornecedor está emitindo a nota deste pacote, direto para o comprador. Quando ela sair, aparece aqui e chega no seu e-mail com o XML e o DANFE.",
    about:
      "O fornecedor emitiu esta nota direto para o comprador. O DANFE é a nota para imprimir; o XML é o arquivo que o contador costuma pedir.",
  },
  remessa: {
    title: "Nota de remessa do fornecedor",
    recipient: "Comprador do pedido",
    coming:
      "O fornecedor está emitindo a remessa, a nota que vai na caixa e cita a sua nota de venda. Quando ela sair, aparece aqui e chega no seu e-mail.",
    about:
      "A remessa vai na caixa com o pacote e cita a sua nota de venda. O fornecedor emite essa nota em nome da sua empresa.",
  },
  purchase: {
    title: "Nota de compra (do fornecedor para você)",
    recipient: "A sua empresa",
    coming:
      "Depois da remessa, o fornecedor emite a nota de venda para a sua empresa: é a nota da sua compra. Quando ela sair, aparece aqui.",
    about:
      "É a nota da compra da sua empresa ao fornecedor. O XML é o arquivo que o contador costuma pedir.",
  },
};

const ICONS: Record<InvoiceStatus, ReactNode> = {
  queued: <ClockIcon aria-hidden="true" className="size-3.5" />,
  sent: <ClockIcon aria-hidden="true" className="size-3.5" />,
  authorized: <CheckIcon aria-hidden="true" className="size-3.5" />,
  attention: <WarningIcon aria-hidden="true" className="size-3.5" />,
  cancelled: undefined,
};

/** What the reseller reads when a note stopped or was cancelled; the reason stays with the supplier. */
const STOPPED_TEXT: Record<"attention" | "cancelled", string> = {
  attention:
    "A nota deste pacote parou no sistema do fornecedor. Ele já foi avisado e precisa corrigir para ela sair. Se demorar, fale com o fornecedor.",
  cancelled: "O fornecedor cancelou esta nota no sistema dele.",
};

function pendingText(
  noteRole: ResellerNoteRole,
  status: Exclude<InvoiceStatus, "authorized">,
): string {
  if (status === "queued" || status === "sent") {
    return ROLE_TEXTS[noteRole].coming;
  }
  return STOPPED_TEXT[status];
}

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

function InvoiceFacts({ invoice, recipient }: { invoice: ResellerInvoice; recipient: string }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-subhead sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="text-footnote text-muted-foreground">Número</dt>
        <dd className="font-medium">{numberLabel(invoice)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-footnote text-muted-foreground">Para quem</dt>
        <dd className="font-medium">{recipient}</dd>
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

function InvoiceDownloads({
  orderId,
  shipmentId,
  noteRole,
}: {
  orderId: string;
  shipmentId: string;
  noteRole: ResellerNoteRole;
}) {
  const withProfile = useTabProfileLink();
  const note = noteRole === "purchase" ? "sale" : "box";
  const link = (kind: "xml" | "danfe") =>
    withProfile(invoiceFileLink({ orderId, shipmentId, kind, note }));
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
  noteRole,
}: {
  orderId: string;
  shipmentId: string;
  invoice: ResellerInvoice;
  noteRole: ResellerNoteRole;
}) {
  return (
    <>
      <InvoiceFacts invoice={invoice} recipient={ROLE_TEXTS[noteRole].recipient} />
      {invoice.accessKey === null ? null : (
        <InvoiceDownloads orderId={orderId} shipmentId={shipmentId} noteRole={noteRole} />
      )}
      <p className="text-footnote text-muted-foreground">{ROLE_TEXTS[noteRole].about}</p>
    </>
  );
}

/**
 * A note the supplier's ERP issues for this parcel (straight to the buyer, the remessa, or the
 * reseller's purchase): while it is on its way or stopped, what is happening; once SEFAZ
 * authorized it, its number, key, date and files.
 */
export function ResellerInvoiceCard({
  orderId,
  shipmentId,
  invoice,
  noteRole = "direct",
}: {
  orderId: string;
  shipmentId: string;
  invoice: ResellerInvoice;
  noteRole?: ResellerNoteRole;
}) {
  const { title } = ROLE_TEXTS[noteRole];
  return (
    <section aria-label={title} className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-subhead font-semibold">
          <FileTextIcon aria-hidden="true" className="size-5" />
          {title}
        </h3>
        <TonePill
          tone={INVOICE_TONES[invoice.status]}
          label={statusLabel(invoice)}
          icon={ICONS[invoice.status]}
        />
      </div>
      {invoice.status === "authorized" ? (
        <AuthorizedBody
          orderId={orderId}
          shipmentId={shipmentId}
          invoice={invoice}
          noteRole={noteRole}
        />
      ) : (
        <p className="text-subhead text-muted-foreground">
          {pendingText(noteRole, invoice.status)}
        </p>
      )}
    </section>
  );
}
