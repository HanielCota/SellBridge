import { useState } from "react";
import { toast } from "sonner";
import { TonePill } from "@/components/data/tone-status";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { BlingConnectionView } from "@/features/supplier-panel/bling/bling-overview";
import { useBlingActions } from "@/features/supplier-panel/bling/use-bling";
import { SUPPLIER_PANEL_BASE_PATH } from "@/features/supplier-panel/home/attention-links";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { useTabProfileLink } from "@/lib/tab-profile";

const SWITCH_ID = "bling-invoice-switch";
const DESCRIPTION_ID = "bling-invoice-description";

function InvoiceState({ connection }: { connection: BlingConnectionView }) {
  const withProfile = useTabProfileLink();
  if (connection.invoiceEnabledAt !== null) {
    const since = formatAbsoluteTime(new Date(connection.invoiceEnabledAt));
    return <TonePill tone="success" label={`Ligada desde ${since}`} />;
  }
  if (!connection.fiscalReady) {
    return (
      <p className="text-sm">
        <TonePill tone="muted" label="Desligada" />{" "}
        <span className="text-muted-foreground">Para ligar, preencha os dados fiscais em </span>
        <Button asChild variant="link" className="h-auto px-0">
          <a href={withProfile(`${SUPPLIER_PANEL_BASE_PATH}/marca`)}>Marca</a>
        </Button>
        .
      </p>
    );
  }
  return <TonePill tone="muted" label="Desligada" />;
}

function EnableInvoicingDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      {...props}
      title="Ligar a nota fiscal pelo Bling?"
      description="A partir de agora, cada pedido novo seu gera uma nota fiscal de verdade no seu Bling, enviada para a SEFAZ, com o comprador como destinatário. Pedidos que já chegaram não ganham nota aqui. Para desligar, é só voltar a chave."
      cancelLabel="Agora não"
      confirmLabel="Ligar a nota fiscal"
      pendingLabel="Ligando…"
    />
  );
}

/**
 * "Nota fiscal pelo Bling": turning it on asks first, since every new order then makes a note
 * with fiscal value; turning it off is immediate.
 */
export function BlingInvoiceSwitch({
  supplierId,
  connection,
}: {
  supplierId: string;
  connection: BlingConnectionView;
}) {
  const [confirming, setConfirming] = useState(false);
  const { setInvoicing } = useBlingActions(supplierId);
  const enabled = connection.invoiceEnabledAt !== null;

  function change(next: boolean) {
    if (next) {
      setConfirming(true);
      return;
    }
    setInvoicing.mutate(false, {
      onSuccess: () => toast.success("Nota fiscal desligada. Pedidos novos não geram nota."),
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 border-t pt-4">
      <div className="grid justify-items-start gap-1.5">
        <label htmlFor={SWITCH_ID} className="text-subhead font-medium">
          Nota fiscal pelo Bling
        </label>
        <p id={DESCRIPTION_ID} className="text-sm text-muted-foreground">
          Cada pedido novo vira pedido e nota no seu Bling, enviada para a SEFAZ. Pedidos de antes
          não entram.
        </p>
        <InvoiceState connection={connection} />
      </div>
      <Switch
        id={SWITCH_ID}
        aria-describedby={DESCRIPTION_ID}
        checked={enabled}
        disabled={setInvoicing.isPending || (!enabled && !connection.fiscalReady)}
        onCheckedChange={change}
      />
      <EnableInvoicingDialog
        open={confirming}
        onOpenChange={setConfirming}
        isPending={setInvoicing.isPending}
        onConfirm={() =>
          setInvoicing.mutate(true, {
            onSuccess: () => {
              setConfirming(false);
              toast.success("Nota fiscal ligada. Os próximos pedidos já saem com nota.");
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </div>
  );
}
