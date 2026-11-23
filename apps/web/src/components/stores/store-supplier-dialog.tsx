import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { type PickableSupplier, SupplierPicker } from "@/components/onboarding/supplier-picker";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
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
import type { StoreSupplierChangeImpact } from "@sellbridge/database/repositories";
import {
  addStoreSupplierFn,
  previewStoreSupplierRemovalFn,
  removeStoreSupplierFn,
} from "@/features/stores/store-suppliers.functions";
import { errorMessage } from "@/lib/errors";

/** A supplier as the stores page shows it. */
export interface StoreSupplierOption {
  id: string;
  name: string;
  niche: string;
  city: string;
  state: string;
  logoUrl: string | null;
  active: boolean;
}

/** A connected shop whose suppliers are being managed. */
export interface StoreSuppliersTarget {
  storeId: string;
  storeName: string;
  /** The suppliers the shop sells, oldest first; known ones only. */
  suppliers: readonly StoreSupplierOption[];
}

/** A shop and one supplier, the input of every change the dialog makes. */
export interface StoreSupplierChange {
  storeConnectionId: string;
  supplierId: string;
}

/** How the dialog changes a shop's suppliers: the seller's own calls, or the team's for a customer. */
export interface StoreSupplierActions {
  add: (change: StoreSupplierChange) => Promise<unknown>;
  remove: (change: StoreSupplierChange) => Promise<unknown>;
  previewRemoval: (change: StoreSupplierChange) => Promise<StoreSupplierChangeImpact>;
  /** Refreshes the screens that show the shop's suppliers. */
  refresh: () => Promise<unknown>;
  /** The query key root the removal preview lives under, so `refresh` drops it too. */
  previewKey: string;
  /** Who can reactivate the paused listings, after the removal note's "Nada é apagado:". */
  reactivateNote: string;
}

type DialogView =
  { kind: "list" } | { kind: "add" } | { kind: "remove"; supplier: StoreSupplierOption };

const FOOTER_CLASS = "sticky -bottom-5 -mx-5 -mb-5 border-t border-border bg-card px-5 py-3";

function countLabel(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count.toLocaleString("pt-BR")} ${many}`;
}

export function useInvalidateStores() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["stores"] }),
      queryClient.invalidateQueries({ queryKey: ["setup-progress"] }),
      queryClient.invalidateQueries({ queryKey: ["listings"] }),
    ]);
}

/** The seller managing the suppliers of their own shops. */
export function useSellerSupplierActions(): StoreSupplierActions {
  const invalidate = useInvalidateStores();
  return {
    add: (change) => addStoreSupplierFn({ data: change }),
    remove: (change) => removeStoreSupplierFn({ data: change }),
    previewRemoval: (change) => previewStoreSupplierRemovalFn({ data: change }),
    refresh: invalidate,
    previewKey: "stores",
    reactivateNote: "se você adicionar o fornecedor de novo, pode reativar os anúncios.",
  };
}

function MutationError({ error }: { error: Error | null }) {
  if (error === null) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {errorMessage(error)}
    </p>
  );
}

function SupplierRow({
  supplier,
  canRemove,
  onRemove,
}: {
  supplier: StoreSupplierOption;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{supplier.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {supplier.niche} · {supplier.city} - {supplier.state}
          {supplier.active ? null : " · fornecedor inativo"}
        </p>
      </div>
      {canRemove ? (
        <Button type="button" variant="outline" size="sm" onClick={onRemove}>
          Tirar<span className="sr-only"> {supplier.name}</span>
        </Button>
      ) : null}
    </li>
  );
}

function SupplierListView({
  target,
  onAdd,
  onRemove,
  onClose,
}: {
  target: StoreSuppliersTarget;
  onAdd: () => void;
  onRemove: (supplier: StoreSupplierOption) => void;
  onClose: () => void;
}) {
  const canRemove = target.suppliers.length > 1;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Fornecedores de {target.storeName}</DialogTitle>
        <DialogDescription>
          A loja vende os produtos destes fornecedores. Cada um envia os próprios produtos ao
          comprador.
        </DialogDescription>
      </DialogHeader>
      <ul aria-label={`Fornecedores de ${target.storeName}`} className="divide-y">
        {target.suppliers.map((supplier) => (
          <SupplierRow
            key={supplier.id}
            supplier={supplier}
            canRemove={canRemove}
            onRemove={() => onRemove(supplier)}
          />
        ))}
      </ul>
      {canRemove ? null : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Para tirar este fornecedor, adicione outro antes: a loja precisa vender pelo menos um.
        </p>
      )}
      <DialogFooter className={FOOTER_CLASS}>
        <Button type="button" variant="ghost" onClick={onClose}>
          Pronto
        </Button>
        <Button type="button" onClick={onAdd}>
          <PlusIcon weight="bold" aria-hidden="true" />
          Adicionar fornecedor
        </Button>
      </DialogFooter>
    </>
  );
}

function useAddSupplier(
  target: StoreSuppliersTarget,
  actions: StoreSupplierActions,
  onDone: () => void,
) {
  return useMutation({
    mutationFn: (supplier: PickableSupplier) =>
      actions.add({ storeConnectionId: target.storeId, supplierId: supplier.id }),
    onSuccess: async (_result, supplier) => {
      await actions.refresh();
      toast.success(`${supplier.name} adicionado a ${target.storeName}`);
      onDone();
    },
  });
}

function addHint(picked: PickableSupplier | null, alreadySold: boolean): string | null {
  if (picked === null) {
    return "Escolha um fornecedor na lista para continuar.";
  }
  if (alreadySold) {
    return `${picked.name} já é fornecedor desta loja.`;
  }
  return null;
}

function AddSupplierView({
  target,
  actions,
  onBack,
  onDone,
}: {
  target: StoreSuppliersTarget;
  actions: StoreSupplierActions;
  onBack: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<PickableSupplier | null>(null);
  const mutation = useAddSupplier(target, actions, onDone);
  const isFirst = target.suppliers.length === 0;
  const alreadySold =
    picked !== null && target.suppliers.some((supplier) => supplier.id === picked.id);
  const hint = addHint(picked, alreadySold);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isFirst
            ? `Escolha o fornecedor de ${target.storeName}`
            : `Adicionar fornecedor a ${target.storeName}`}
        </DialogTitle>
        <DialogDescription>
          Os produtos dele passam a poder ser publicados nesta loja. Os anúncios que a loja já tem
          continuam iguais.
        </DialogDescription>
      </DialogHeader>
      <SupplierPicker value={picked?.id ?? null} onChange={setPicked} />
      <MutationError error={mutation.error} />
      <DialogFooter className={`${FOOTER_CLASS} sm:items-center`}>
        {hint === null ? null : (
          <p aria-live="polite" className="text-sm text-muted-foreground sm:mr-auto">
            {hint}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onBack}>
          {isFirst ? "Cancelar" : "Voltar"}
        </Button>
        <Button
          type="button"
          disabled={hint !== null || mutation.isPending}
          onClick={() => {
            if (picked !== null) {
              mutation.mutate(picked);
            }
          }}
        >
          {mutation.isPending ? "Adicionando…" : "Adicionar fornecedor"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** What removing the supplier does to the shop's publications, before the seller confirms. */
function RemovalImpact({
  change,
  actions,
}: {
  change: StoreSupplierChange;
  actions: StoreSupplierActions;
}) {
  const query = useQuery({
    queryKey: [actions.previewKey, "supplier-removal-preview", change],
    queryFn: () => actions.previewRemoval(change),
    staleTime: 0,
  });
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
        Nenhum anúncio desta loja é afetado.
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
      className="flex gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-800 dark:text-amber-300"
    >
      <WarningIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {parts.join(" e ")}. Nada é apagado: {actions.reactivateNote}
      </span>
    </p>
  );
}

function useRemoveSupplier(
  target: StoreSuppliersTarget,
  supplier: StoreSupplierOption,
  actions: StoreSupplierActions,
  onDone: () => void,
) {
  return useMutation({
    mutationFn: () =>
      actions.remove({ storeConnectionId: target.storeId, supplierId: supplier.id }),
    onSuccess: async () => {
      await actions.refresh();
      toast.success(`${supplier.name} não é mais fornecedor de ${target.storeName}`);
      onDone();
    },
  });
}

function RemoveSupplierView({
  target,
  supplier,
  actions,
  onBack,
}: {
  target: StoreSuppliersTarget;
  supplier: StoreSupplierOption;
  actions: StoreSupplierActions;
  onBack: () => void;
}) {
  const mutation = useRemoveSupplier(target, supplier, actions, onBack);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Tirar {supplier.name} de {target.storeName}
        </DialogTitle>
        <DialogDescription>
          A loja deixa de vender os produtos deste fornecedor. Os outros fornecedores continuam
          iguais.
        </DialogDescription>
      </DialogHeader>
      <RemovalImpact
        change={{ storeConnectionId: target.storeId, supplierId: supplier.id }}
        actions={actions}
      />
      <MutationError error={mutation.error} />
      <DialogFooter className={FOOTER_CLASS}>
        <Button type="button" variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Tirando…" : "Tirar fornecedor"}
        </Button>
      </DialogFooter>
    </>
  );
}

function SupplierDialogBody({
  target,
  actions,
  onClose,
}: {
  target: StoreSuppliersTarget;
  actions: StoreSupplierActions;
  onClose: () => void;
}) {
  const isPending = target.suppliers.length === 0;
  const [view, setView] = useState<DialogView>(isPending ? { kind: "add" } : { kind: "list" });
  const showList = () => setView({ kind: "list" });
  if (view.kind === "remove") {
    return (
      <RemoveSupplierView
        target={target}
        supplier={view.supplier}
        actions={actions}
        onBack={showList}
      />
    );
  }
  if (view.kind === "add") {
    return (
      <AddSupplierView
        target={target}
        actions={actions}
        onBack={isPending ? onClose : showList}
        onDone={showList}
      />
    );
  }
  return (
    <SupplierListView
      target={target}
      onAdd={() => setView({ kind: "add" })}
      onRemove={(supplier) => setView({ kind: "remove", supplier })}
      onClose={onClose}
    />
  );
}

/**
 * Lists, adds and removes the suppliers a shop sells; open while `target` is set. A shop with no
 * supplier yet opens straight on the picker. The seller and the team share it through `actions`.
 */
export function StoreSupplierDialog({
  target,
  actions,
  onClose,
}: {
  target: StoreSuppliersTarget | null;
  actions: StoreSupplierActions;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto rounded-[1.75rem] p-5 sm:max-w-2xl">
        {target === null ? null : (
          <SupplierDialogBody
            key={target.storeId}
            target={target}
            actions={actions}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Picks the supplier the next shop starts with, before connecting it; open while `open`. */
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
            A loja que você conectar agora começa vendendo os produtos deste fornecedor. Depois dá
            para adicionar outros.
          </DialogDescription>
        </DialogHeader>
        <SupplierPicker value={picked?.id ?? currentSupplierId} onChange={setPicked} />
        <DialogFooter className={FOOTER_CLASS}>
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
