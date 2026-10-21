import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { type PickableSupplier, SupplierPicker } from "@/components/onboarding/supplier-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { changeStoreSupplierFn } from "@/features/stores/store-suppliers.functions";
import { storeSupplierPreviewQueryOptions } from "@/features/stores/store-suppliers.queries";
import { errorMessage } from "@/lib/errors";

/** A connected shop whose supplier is being picked or changed. */
export interface StoreSupplierTarget {
  storeId: string;
  storeName: string;
  currentSupplierId: string | null;
}

function countLabel(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count.toLocaleString("pt-BR")} ${many}`;
}

/** What the change does to the shop's publications, before the seller confirms it. */
function ChangeImpact({ storeId, supplierId }: { storeId: string; supplierId: string }) {
  const query = useQuery(storeSupplierPreviewQueryOptions(storeId, supplierId));
  if (query.isPending) {
    return <Skeleton className="h-12 rounded-2xl" />;
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{errorMessage(query.error)}</p>;
  }
  const { livePaused, queuedStopped } = query.data;
  if (livePaused === 0 && queuedStopped === 0) {
    return (
      <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        Nenhuma publicação desta loja é afetada.
      </p>
    );
  }
  const parts = [
    livePaused > 0
      ? countLabel(livePaused, "anúncio no ar será pausado", "anúncios no ar serão pausados")
      : null,
    queuedStopped > 0
      ? countLabel(
          queuedStopped,
          "publicação na fila será interrompida",
          "publicações na fila serão interrompidas",
        )
      : null,
  ].filter((part) => part !== null);
  return (
    <p
      aria-live="polite"
      className="flex gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
    >
      <WarningIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {parts.join(" e ")}. Eles são do fornecedor anterior; nada é apagado, e voltar ao fornecedor
        anterior permite reativá-los.
      </span>
    </p>
  );
}

function useChangeStoreSupplier(target: StoreSupplierTarget, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (supplierId: string) =>
      changeStoreSupplierFn({ data: { storeConnectionId: target.storeId, supplierId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stores"] }),
        queryClient.invalidateQueries({ queryKey: ["setup-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["listings"] }),
      ]);
      toast.success(`Fornecedor de ${target.storeName} atualizado`);
      onDone();
    },
  });
}

function dialogTitle(target: StoreSupplierTarget): string {
  return target.currentSupplierId === null
    ? `Escolha o fornecedor de ${target.storeName}`
    : `Trocar o fornecedor de ${target.storeName}`;
}

function StoreSupplierForm({
  target,
  onClose,
}: {
  target: StoreSupplierTarget;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<PickableSupplier | null>(null);
  const mutation = useChangeStoreSupplier(target, onClose);
  const pickedId = picked?.id ?? target.currentSupplierId;
  const changed = picked !== null && picked.id !== target.currentSupplierId;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{dialogTitle(target)}</DialogTitle>
        <DialogDescription>
          Cada loja vende os produtos de um único fornecedor, de qualquer lugar do Brasil.
        </DialogDescription>
      </DialogHeader>
      <SupplierPicker value={pickedId} onChange={setPicked} />
      {changed ? <ChangeImpact storeId={target.storeId} supplierId={picked.id} /> : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
      <DialogFooter className="sticky -bottom-5 -mx-5 bg-card/90 px-5 py-3 backdrop-blur-xl">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!changed || mutation.isPending}
          onClick={() => {
            if (picked !== null) {
              mutation.mutate(picked.id);
            }
          }}
        >
          {mutation.isPending ? "Salvando…" : "Salvar fornecedor"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Picks or changes the one supplier a shop sells; open while `target` is set. */
export function StoreSupplierDialog({
  target,
  onClose,
}: {
  target: StoreSupplierTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto rounded-[1.75rem] p-5 sm:max-w-2xl">
        {target === null ? null : <StoreSupplierForm target={target} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** Picks the supplier the next shop will sell, before connecting it; open while `open`. */
export function NewStoreSupplierDialog({
  open,
  currentSupplierId,
  onPicked,
  onClose,
}: {
  open: boolean;
  currentSupplierId: string | null;
  onPicked: (supplier: PickableSupplier) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<PickableSupplier | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto rounded-[1.75rem] p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fornecedor da nova loja</DialogTitle>
          <DialogDescription>
            A loja que você conectar agora vende os produtos deste fornecedor.
          </DialogDescription>
        </DialogHeader>
        <SupplierPicker value={picked?.id ?? currentSupplierId} onChange={setPicked} />
        <DialogFooter className="sticky -bottom-5 -mx-5 bg-card/90 px-5 py-3 backdrop-blur-xl">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={picked === null}
            onClick={() => {
              if (picked !== null) {
                onPicked(picked);
              }
            }}
          >
            Usar este fornecedor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
