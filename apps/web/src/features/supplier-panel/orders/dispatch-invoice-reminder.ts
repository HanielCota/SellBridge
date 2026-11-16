import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import type { InvoiceStatus } from "@sellbridge/shared/supplier-invoice";

export interface DispatchInvoiceReminder {
  title: string;
  description: string;
}

const WAITING: DispatchInvoiceReminder = {
  title: "A nota fiscal ainda não saiu",
  description:
    "Se despachar agora, o pacote sai sem a nota impressa. Costuma levar poucos minutos: espere a nota sair e imprima o DANFE para mandar junto.",
};

const STOPPED: DispatchInvoiceReminder = {
  title: "A nota fiscal deste pedido está com problema",
  description:
    "Se despachar agora, o pacote sai sem a nota impressa. Corrija a nota acima, ou emita direto no Bling, e mande o DANFE junto.",
};

/**
 * The reminder shown before "Despachar" when the parcel's NF-e is not out yet. Only a reminder:
 * dispatching stays possible, since the supplier may issue the note straight in the ERP. Null
 * when there is nothing to remind (no note from the ERP, already issued or cancelled, or the
 * parcel is not at the dispatch step).
 */
export function dispatchInvoiceReminder(
  status: FulfillmentStatus,
  invoiceStatus: InvoiceStatus | null,
): DispatchInvoiceReminder | null {
  if (status !== "ready" || invoiceStatus === null) {
    return null;
  }
  if (invoiceStatus === "attention") {
    return STOPPED;
  }
  if (invoiceStatus === "queued" || invoiceStatus === "sent") {
    return WAITING;
  }
  return null;
}
