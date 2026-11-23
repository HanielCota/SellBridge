import {
  BUYER_ADDRESS_RELEASE_NOTE_MAX_LENGTH,
  type BuyerAddressResult,
} from "@sellbridge/shared/buyer-address";
import { releaseStoreBuyerAddressSchema } from "@sellbridge/shared/schemas";
import { useState } from "react";
import { TonePill } from "@/components/data/tone-status";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { TextareaField } from "@/components/form/textarea-field";
import { adminReleaseStoreBuyerAddress } from "@/features/admin/customers.functions";
import { useAdminAction } from "@/features/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { formatSmartDate } from "@/lib/relative-time";

/** Room to paste a little more than the limit, so the refusal says how much to cut. */
const TYPING_LIMIT = BUYER_ADDRESS_RELEASE_NOTE_MAX_LENGTH * 2;

/** A shop's last purchase-address check, as the team sees it. */
export interface CustomerStoreBuyerAddress {
  result: BuyerAddressResult;
  supplierName: string | null;
  releasedAt: Date | null;
  releaseNote: string | null;
}

/**
 * Under a shop held by its purchase address: what the reseller sees, and the release button for a
 * false alarm. A released shop shows when and why, so the next person reads the same story.
 */
export function CustomerStoreBuyerAddressLine({
  check,
  onRelease,
}: {
  check: CustomerStoreBuyerAddress | null;
  onRelease: () => void;
}) {
  if (check === null || check.result !== "supplier_address") {
    return null;
  }
  const supplier = check.supplierName ?? "um fornecedor";
  if (check.releasedAt !== null) {
    return (
      <p className="text-footnote text-muted-foreground" suppressHydrationWarning>
        Endereço de compra liberado pela equipe {formatSmartDate(check.releasedAt)}:{" "}
        {check.releaseNote}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <TonePill tone="danger" label={`Compras indo para ${supplier}`} />
      <span className="text-footnote text-muted-foreground">
        Não publica produtos novos até trocar o endereço de compra.
      </span>
      <Button size="sm" variant="outline" className="h-11 sm:h-8" onClick={onRelease}>
        Liberar: é alarme falso
      </Button>
    </div>
  );
}

export interface ReleaseTarget {
  storeConnectionId: string;
  shopName: string;
  supplierName: string | null;
}

/** The note, its refusal and the call; `close` forgets all three. */
function useReleaseBuyerAddress(userId: string, onClose: () => void) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clearAndClose = () => {
    setNote("");
    setError(null);
    onClose();
  };
  const release = useAdminAction(
    (data: { userId: string; storeConnectionId: string; note: string }) =>
      adminReleaseStoreBuyerAddress({ data }),
    "Loja liberada para publicar",
    clearAndClose,
  );
  const close = () => {
    // The next store's dialog must not open with this attempt's refusal.
    release.reset();
    clearAndClose();
  };
  const confirm = (storeConnectionId: string) => {
    const parsed = releaseStoreBuyerAddressSchema.safeParse({ userId, storeConnectionId, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira o motivo.");
      return;
    }
    setError(null);
    release.mutate(parsed.data);
  };
  return { note, setNote, error, release, close, confirm };
}

/**
 * "Liberar: é alarme falso": the store publishes again while its account keeps buying at that
 * same address. Asks why, for the timeline and for the reseller's card.
 */
export function BuyerAddressReleaseDialog({
  userId,
  target,
  onClose,
}: {
  userId: string;
  target: ReleaseTarget | null;
  onClose: () => void;
}) {
  const { note, setNote, error, release, close, confirm } = useReleaseBuyerAddress(userId, onClose);
  const supplier = target?.supplierName ?? "o fornecedor";
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => (open ? undefined : close())}
      title={`Liberar ${target?.shopName ?? "a loja"} para publicar?`}
      description={`Use quando o endereço de compra só parece o de ${supplier}, como um revendedor que mora no mesmo prédio. A loja volta a publicar na hora. Se o cliente trocar o endereço e depois ele voltar para um fornecedor, a trava volta.`}
      confirmLabel="Liberar loja"
      pendingLabel="Liberando…"
      isPending={release.isPending}
      onConfirm={() => (target === null ? undefined : confirm(target.storeConnectionId))}
    >
      <div className="grid gap-4">
        <FormErrorAlert message={release.isError ? errorMessage(release.error) : null} />
        <TextareaField
          id="buyer-address-release-note"
          label="Por que é alarme falso?"
          hint={`O cliente vê este motivo no cartão da loja. Até ${BUYER_ADDRESS_RELEASE_NOTE_MAX_LENGTH} caracteres.`}
          placeholder="Exemplo: o revendedor mora no mesmo prédio do fornecedor, em outro apartamento."
          value={note}
          errors={error === null ? [] : [error]}
          onValueChange={setNote}
          rows={3}
          maxLength={TYPING_LIMIT}
        />
      </div>
    </ConfirmDialog>
  );
}
