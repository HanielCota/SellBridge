import { WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { adminChangeStoreSupplier } from "@/features/admin/customers.functions";
import { adminStoreSupplierPreviewQueryOptions } from "@/features/admin/customers.queries";
import { useAdminAction } from "@/features/admin/use-admin-action";
import { errorMessage } from "@/lib/errors";

/** A customer's shop whose supplier the team is changing. */
export interface AdminStoreSupplierTarget {
  userId: string;
  storeId: string;
  storeName: string;
  currentSupplierId: string | null;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count.toLocaleString("pt-BR")} ${many}`;
}

/** The impact on the customer's publications, before the team confirms the change. */
function ChangeImpact({
  target,
  supplierId,
}: {
  target: AdminStoreSupplierTarget;
  supplierId: string;
}) {
  const query = useQuery(
    adminStoreSupplierPreviewQueryOptions({
      userId: target.userId,
      storeConnectionId: target.storeId,
      supplierId,
    }),
  );
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
      ? plural(livePaused, "anúncio no ar será pausado", "anúncios no ar serão pausados")
      : null,
    queuedStopped > 0
      ? plural(
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
        {parts.join(" e ")}. Nada é apagado; o cliente pode voltar ao fornecedor anterior.
      </span>
    </p>
  );
}

function ChangeForm({
  target,
  onClose,
}: {
  target: AdminStoreSupplierTarget;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<PickableSupplier | null>(null);
  const change = useAdminAction(
    (supplierId: string) =>
      adminChangeStoreSupplier({
        data: { userId: target.userId, storeConnectionId: target.storeId, supplierId },
      }),
    `Fornecedor de ${target.storeName} atualizado`,
    onClose,
  );
  const changed = picked !== null && picked.id !== target.currentSupplierId;
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {target.currentSupplierId === null ? "Escolha o fornecedor de" : "Trocar o fornecedor de"}{" "}
          {target.storeName}
        </DialogTitle>
        <DialogDescription>
          Cada loja vende os produtos de um único fornecedor. A troca fica no histórico do cliente.
        </DialogDescription>
      </DialogHeader>
      <SupplierPicker value={picked?.id ?? target.currentSupplierId} onChange={setPicked} />
      {picked !== null && changed ? <ChangeImpact target={target} supplierId={picked.id} /> : null}
      <DialogFooter className="sticky -bottom-5 -mx-5 -mb-5 bg-card/90 px-5 py-3 backdrop-blur-xl">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!changed || change.isPending}
          onClick={() => {
            if (picked !== null) {
              change.mutate(picked.id);
            }
          }}
        >
          {change.isPending ? "Salvando…" : "Trocar fornecedor"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The team changes the one supplier a customer's shop sells; open while `target` is set. */
export function AdminStoreSupplierDialog({
  target,
  onClose,
}: {
  target: AdminStoreSupplierTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto rounded-[1.75rem] p-5 sm:max-w-2xl">
        {target === null ? null : <ChangeForm target={target} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
