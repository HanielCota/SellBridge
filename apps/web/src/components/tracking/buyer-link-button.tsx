import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyButton } from "@/components/integrations/copy-button";
import { Button } from "@/components/ui/button";
import { issueBuyerTrackingLinkFn } from "@/features/buyer-tracking/buyer-tracking.functions";
import { errorMessage } from "@/lib/errors";

/**
 * The buyer's tracking page for this parcel: the store's name, the steps and the code, never the
 * supplier. Asking again gives the same link. It shows with its own copy button: a copy made
 * after the server answers is no longer the tap's, and Safari refuses it.
 */
export function BuyerLinkButton({ shipmentId }: { shipmentId: string }) {
  const mutation = useMutation({
    mutationFn: () => issueBuyerTrackingLinkFn({ data: { shipmentId } }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (mutation.data !== undefined) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-sm text-muted-foreground">{mutation.data.url}</span>
        <CopyButton value={mutation.data.url} label="Copiar link" />
      </div>
    );
  }
  return (
    <Button
      variant="ghost"
      disabled={mutation.isPending}
      title="Página de rastreio com o nome da sua loja, sem login"
      onClick={() => mutation.mutate()}
    >
      Enviar link ao comprador
    </Button>
  );
}
