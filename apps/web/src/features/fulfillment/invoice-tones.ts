import type { InvoiceStatus } from "@sellbridge/shared/supplier-invoice";
import type { StatusTone } from "@/components/data/tone-status";

/** Each note status in the color it has on every screen. */
export const INVOICE_TONES: Record<InvoiceStatus, StatusTone> = {
  queued: "muted",
  sent: "warning",
  authorized: "success",
  attention: "danger",
  cancelled: "muted",
};
