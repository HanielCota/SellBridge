import {
  applySupplierFlagSchema,
  revokeSupplierFlagSchema,
  SUPPLIER_FLAG_NOTE_MAX_LENGTH,
  SUPPLIER_FLAG_REASON_LABELS,
  SUPPLIER_FLAG_REASONS,
  type SupplierFlagReason,
} from "@sellbridge/shared/supplier-flags";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { TextareaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  teamApplySupplierFlag,
  teamRevokeSupplierFlag,
} from "@/features/admin-suppliers/supplier-flags.functions";
import { supplierFlagsQueryKey } from "@/features/admin-suppliers/supplier-flags.queries";
import { errorMessage } from "@/lib/errors";

/**
 * The browser's `maxLength` counts an emoji as two; the schema counts characters like the database.
 * Typing stops at twice the limit and the schema gives the exact message.
 */
const TYPING_LIMIT = SUPPLIER_FLAG_NOTE_MAX_LENGTH * 2;

function isFlagReason(value: string): value is SupplierFlagReason {
  return SUPPLIER_FLAG_REASONS.some((reason) => reason === value);
}

/** The first message of each field, as the form shows it under the field. */
function issuesByField(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    errors[field] = errors[field] ?? issue.message;
  }
  return errors;
}

function useFlagMutation<TInput>(
  supplierId: string,
  action: (input: { data: TInput }) => Promise<unknown>,
  successMessage: string,
  onDone: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: TInput) => await action({ data }),
    onSuccess: async () => {
      toast.success(successMessage);
      await queryClient.invalidateQueries({ queryKey: supplierFlagsQueryKey(supplierId) });
      onDone();
    },
  });
}

function ReasonSelect({
  value,
  error,
  onChange,
}: {
  value: SupplierFlagReason | "";
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="flag-reason">Motivo</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id="flag-reason"
          className="w-full"
          aria-invalid={error === undefined ? undefined : true}
        >
          <SelectValue placeholder="Escolha o que aconteceu" />
        </SelectTrigger>
        <SelectContent>
          {SUPPLIER_FLAG_REASONS.map((option) => (
            <SelectItem key={option} value={option}>
              {SUPPLIER_FLAG_REASON_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error === undefined ? null : <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ApplyFlagForm({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const [reason, setReason] = useState<SupplierFlagReason | "">("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const apply = useFlagMutation(supplierId, teamApplySupplierFlag, "Flag aplicada.", onClose);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = applySupplierFlagSchema.safeParse({ supplierId, reason, note });
    if (!parsed.success) {
      setErrors(issuesByField(parsed.error.issues));
      return;
    }
    setErrors({});
    apply.mutate(parsed.data);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="grid gap-5">
      <FormErrorAlert message={apply.isError ? errorMessage(apply.error) : null} />
      <ReasonSelect
        value={reason}
        error={errors.reason}
        onChange={(value) => setReason(isFlagReason(value) ? value : "")}
      />
      <TextareaField
        id="flag-note"
        label={reason === "other" ? "Observação" : "Observação (opcional)"}
        hint="O fornecedor lê esta observação no painel"
        placeholder="Exemplo: o pedido 1234 saiu com a cor trocada."
        value={note}
        errors={errors.note === undefined ? [] : [errors.note]}
        onValueChange={setNote}
        rows={3}
        maxLength={TYPING_LIMIT}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={apply.isPending}>
          {apply.isPending ? "Aplicando…" : "Aplicar flag"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Aplicar flag": a reason and a note the supplier reads; it counts for 90 days. */
export function ApplyFlagDialog({
  supplierId,
  open,
  onClose,
}: {
  supplierId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-5 rounded-[1.75rem] p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aplicar flag</DialogTitle>
          <DialogDescription>
            O fornecedor vê o motivo e a observação no painel por 90 dias e pode contestar pelo
            suporte. Nada muda automaticamente na conta dele.
          </DialogDescription>
        </DialogHeader>
        {open ? <ApplyFlagForm supplierId={supplierId} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** "Retirar flag": asks why; the note stays with the team, the supplier never sees it. */
export function RevokeFlagDialog({
  supplierId,
  flagId,
  onClose,
}: {
  supplierId: string;
  flagId: string | null;
  onClose: () => void;
}) {
  const [revokeNote, setRevokeNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setRevokeNote("");
    setError(null);
    onClose();
  };
  const revoke = useFlagMutation(supplierId, teamRevokeSupplierFlag, "Flag retirada.", close);

  function confirm() {
    const parsed = revokeSupplierFlagSchema.safeParse({ supplierId, flagId, revokeNote });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira a observação.");
      return;
    }
    setError(null);
    revoke.mutate(parsed.data);
  }

  return (
    <ConfirmDialog
      open={flagId !== null}
      onOpenChange={(open) => (open ? undefined : close())}
      title="Retirar flag?"
      description="A flag deixa de contar na hora e some do painel do fornecedor. Ele não vê esta observação."
      confirmLabel="Retirar flag"
      pendingLabel="Retirando…"
      destructive
      isPending={revoke.isPending}
      onConfirm={confirm}
    >
      <div className="grid gap-4">
        <FormErrorAlert message={revoke.isError ? errorMessage(revoke.error) : null} />
        <TextareaField
          id="flag-revoke-note"
          label="Por que retirar?"
          placeholder="Exemplo: aplicada por engano."
          value={revokeNote}
          errors={error === null ? [] : [error]}
          onValueChange={setRevokeNote}
          rows={3}
          maxLength={TYPING_LIMIT}
        />
      </div>
    </ConfirmDialog>
  );
}
