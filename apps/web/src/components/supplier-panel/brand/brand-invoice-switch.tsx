import type { InvoiceModel } from "@sellbridge/shared/supplier-invoice";
import { BlingInvoiceSwitch } from "@/components/supplier-panel/bling/bling-invoice-switch";
import { useBlingOverview } from "@/features/supplier-panel/bling/use-bling";

/**
 * "Nota fiscal pelo Bling" right under "Como sai a nota", so the choice and the switch that makes
 * the note go out live on one screen. Without a connected Bling there is no switch: the venda à
 * ordem box below already says where to connect it.
 */
export function BrandInvoiceSwitch({
  supplierId,
  invoiceModel,
}: {
  supplierId: string;
  invoiceModel: InvoiceModel;
}) {
  const overview = useBlingOverview(supplierId);
  const connection = overview.data?.connection ?? null;
  if (connection === null) {
    return null;
  }
  return (
    <BlingInvoiceSwitch
      supplierId={supplierId}
      connection={connection}
      invoiceModel={invoiceModel}
    />
  );
}
