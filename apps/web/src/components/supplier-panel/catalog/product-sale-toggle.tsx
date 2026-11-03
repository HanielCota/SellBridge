import type { SupplierPanelProduct } from "@sellbridge/database/repositories";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ToneStatus } from "@/components/data/tone-status";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { CONTROL_HINTS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { catalogStatusMessage } from "@/features/admin-suppliers/catalog-status";
import { supplierPanelSetProductActive } from "@/features/supplier-panel/catalog/catalog.functions";
import { supplierPanelCatalogKey } from "@/features/supplier-panel/catalog/catalog.queries";
import { errorMessage } from "@/lib/errors";
import { ReviewStatus } from "./review-status";

/** The review status, plus "Desativado" while the product is off sale. */
export function ProductStatus({ product }: { product: SupplierPanelProduct }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <ReviewStatus status={product.reviewStatus} />
      {product.active ? null : <ToneStatus tone="muted" label="Desativado" />}
    </span>
  );
}

function useSetActive(product: SupplierPanelProduct, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (active: boolean) =>
      await supplierPanelSetProductActive({
        data: { supplierId: product.supplierId, productId: product.id, active },
      }),
    onSuccess: async (result) => {
      onDone();
      toast.success(catalogStatusMessage("Produto", result));
      await queryClient.invalidateQueries({
        queryKey: supplierPanelCatalogKey(product.supplierId),
      });
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
