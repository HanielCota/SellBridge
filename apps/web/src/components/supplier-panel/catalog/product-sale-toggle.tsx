import type { SupplierPanelProduct } from "@sellbridge/database/repositories";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { CONTROL_HINTS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { supplierPanelSetProductActive } from "@/features/supplier-panel/catalog/catalog.functions";
import { saleSwitchMessage } from "@/features/supplier-panel/catalog/sale-switch-message";
import { errorMessage } from "@/lib/errors";

function useSetActive(product: SupplierPanelProduct, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (active: boolean) =>
      await supplierPanelSetProductActive({
        data: { supplierId: product.supplierId, productId: product.id, active },
      }),
    onSuccess: async (result) => {
      onDone();
      toast.success(saleSwitchMessage(result));
      // The whole panel: the home's catalog figures count only products on sale.
      await queryClient.invalidateQueries({ queryKey: ["supplier-panel", product.supplierId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/**
 * Takes a product off sale or puts it back. Taking it off asks first: the resellers' live
 * listings pause, and coming back does not resume them.
 */
export function ProductSaleToggle({ product }: { product: SupplierPanelProduct }) {
  const [confirming, setConfirming] = useState(false);
  const setActive = useSetActive(product, () => setConfirming(false));
  if (product.active) {
    return (
      <>
        <Hint label={CONTROL_HINTS.deactivateProduct} openOnTap={false}>
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            Desativar
          </Button>
        </Hint>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Desativar este produto?"
          description={`"${product.title || product.sku}" sai do catálogo dos revendedores e os anúncios no ar são pausados. Dá para reativar depois, e cada revendedor volta o anúncio quando quiser.`}
          confirmLabel="Desativar"
          pendingLabel="Desativando…"
          isPending={setActive.isPending}
          destructive
          onConfirm={() => setActive.mutate(false)}
        />
      </>
    );
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={setActive.isPending}
      onClick={() => setActive.mutate(true)}
    >
      {setActive.isPending ? "Reativando…" : "Reativar"}
    </Button>
  );
}
