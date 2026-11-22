import { Button } from "@/components/ui/button";
import {
  INVOICE_SETUP_ANCHOR,
  SUPPLIER_PANEL_BASE_PATH,
} from "@/features/supplier-panel/home/attention-links";
import { useTabProfileLink } from "@/lib/tab-profile";

/** The note is set where its model is chosen: this card only points there. */
export function InvoiceSetupLink() {
  const withProfile = useTabProfileLink();
  return (
    <p className="border-t pt-4 text-sm text-muted-foreground">
      A nota fiscal pelo Bling se liga em{" "}
      <Button asChild variant="link" className="h-auto px-0">
        <a href={withProfile(`${SUPPLIER_PANEL_BASE_PATH}/marca#${INVOICE_SETUP_ANCHOR}`)}>
          Marca, em “Como sai a nota”
        </a>
      </Button>
      .
    </p>
  );
}
