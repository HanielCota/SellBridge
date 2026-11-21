import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supplierPanelCatalogKey } from "@/features/supplier-panel/catalog/catalog.queries";
import { supplierPanelSeparateModel } from "@/features/supplier-panel/catalog/grouping/grouping.functions";
import { errorMessage } from "@/lib/errors";
import { formatSmartDate } from "@/lib/relative-time";

/** Says what comes back and what does not before separating. */
function SeparateDialog({
  open,
  products,
  isPending,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  products: number;
  isPending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Separar os {products} produtos?</DialogTitle>
          <DialogDescription>
            Cada um volta a aparecer sozinho na sua lista, com o nome, as fotos e a ficha que tinha
            antes de juntar. Estoque, custo e preço continuam os de agora. Os anúncios no ar
            continuam iguais e vendendo.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          As mudanças de nome, fotos e ficha feitas na grade depois de juntar não voltam.
        </p>
        {error === null ? null : (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Manter juntos
          </Button>
          <Button className="min-h-11" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Separando..." : `Separar ${products} produtos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A grid that came from grouping products can become those products again, whenever the
 * supplier wants; the dialog says what comes back and what does not.
 */
export function SeparateGridCard({
  supplierId,
  modelId,
  groupedAt,
  products,
  onSeparated,
}: {
  supplierId: string;
  modelId: string;
  groupedAt: string;
  products: number;
  onSeparated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const separate = useMutation({
    mutationFn: async () => await supplierPanelSeparateModel({ data: { supplierId, modelId } }),
    onSuccess: async (result) => {
      toast.success(`${result.products} produtos separados de novo, como estavam antes.`);
      await queryClient.invalidateQueries({ queryKey: supplierPanelCatalogKey(supplierId) });
      setOpen(false);
      onSeparated();
    },
  });
  return (
    <section className="surface-card grid gap-3 rounded-3xl bg-card p-5 sm:flex sm:items-center sm:justify-between sm:p-6">
      <div className="space-y-1">
        <h2 className="text-subhead font-semibold">Juntada de produtos que você já tinha</h2>
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          {`Juntada ${formatSmartDate(new Date(groupedAt))}. Se preferir, os produtos voltam a ser separados.`}
        </p>
      </div>
      <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setOpen(true)}>
        Separar de novo
      </Button>
      <SeparateDialog
        open={open}
        products={products}
        isPending={separate.isPending}
        error={separate.isError ? errorMessage(separate.error) : null}
        onOpenChange={setOpen}
        onConfirm={() => separate.mutate()}
      />
    </section>
  );
}
