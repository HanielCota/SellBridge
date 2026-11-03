import type { SupplierPanelListProduct } from "@sellbridge/database/repositories";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { supplierPanelDeleteProduct } from "@/features/supplier-panel/catalog/catalog.functions";
import { errorMessage } from "@/lib/errors";

/**
 * Deletes a product no reseller ever published or sold; the list offers it only then, and the
 * server checks again.
 */
export function ProductDeleteButton({ product }: { product: SupplierPanelListProduct }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: async () =>
      await supplierPanelDeleteProduct({
        data: { supplierId: product.supplierId, productId: product.id },
      }),
    onSuccess: async () => {
      setConfirming(false);
      toast.success("Produto excluído");
      await queryClient.invalidateQueries({ queryKey: ["supplier-panel", product.supplierId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (product.deletable) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Excluir
        </Button>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Excluir este produto?"
          description={`"${product.title || product.sku}" será apagado de vez, com os dados e as fotos. Não dá para desfazer. Só aparece esta opção porque nenhum revendedor publicou nem vendeu o produto.`}
          confirmLabel="Excluir"
          pendingLabel="Excluindo…"
          isPending={remove.isPending}
          destructive
          onConfirm={() => remove.mutate()}
        />
      </>
    );
  }
  return null;
}
