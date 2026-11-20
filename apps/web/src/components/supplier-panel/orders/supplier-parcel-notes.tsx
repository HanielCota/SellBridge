import { ClockIcon, ReceiptIcon } from "@phosphor-icons/react";
import { TonePill } from "@/components/data/tone-status";
import { SupplierInvoiceCard, type SupplierInvoice } from "./supplier-invoice-card";

interface ParcelNotesProps {
  supplierId: string;
  shipmentId: string;
  orderId: string;
  invoice: SupplierInvoice | null;
  saleInvoice: SupplierInvoice | null;
  /** Null for a parcel of the direct note. */
  resellerNote: { found: boolean } | null;
}

/** Venda à ordem: the supplier's notes wait for the reseller's own sale note to the buyer. */
function WaitingForResellerNote() {
  return (
    <section aria-label="Nota do revendedor" className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-subhead font-semibold">
          <ReceiptIcon aria-hidden="true" className="size-5" />
          Nota do revendedor
        </h3>
        <TonePill
          tone="warning"
          label="Esperando o revendedor"
          icon={<ClockIcon aria-hidden="true" className="size-3.5" />}
        />
      </div>
      <p className="text-subhead text-muted-foreground">
        Nesta venda à ordem, o revendedor emite a nota de venda para o comprador. Assim que ela
        chegar, o SellBridge emite pelo seu Bling a remessa, que vai na caixa, e depois a venda para
        o revendedor. Esta tela atualiza sozinha.
      </p>
    </section>
  );
}

/**
 * The parcel's notes on the supplier's order: the direct note, or, in venda à ordem, the wait for
 * the reseller's note, then the remessa and the sale to the reseller.
 */
export function SupplierParcelNotes(props: ParcelNotesProps) {
  const parcel = {
    supplierId: props.supplierId,
    shipmentId: props.shipmentId,
    orderId: props.orderId,
  };
  if (props.resellerNote === null) {
    return <SupplierInvoiceCard {...parcel} invoice={props.invoice} />;
  }
  return (
    <>
      {props.resellerNote.found ? null : <WaitingForResellerNote />}
      <SupplierInvoiceCard {...parcel} invoice={props.invoice} noteRole="remessa" />
      <SupplierInvoiceCard {...parcel} invoice={props.saleInvoice} noteRole="sale" />
    </>
  );
}
