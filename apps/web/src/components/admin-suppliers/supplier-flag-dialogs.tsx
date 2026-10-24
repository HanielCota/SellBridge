import {
  applySupplierFlagSchema,
  flagDeactivatesSupplier,
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
import { appliedMessage, BrokenRuleHint, DeactivationConfirm } from "./apply-flag-parts";

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

function useFlagMutation<TInput, TResult>(
  supplierId: string,
  action: (input: { data: TInput }) => Promise<TResult>,
  successMessage: (result: TResult) => string,
  onDone: () => void,
) {
  const queryClient = useQueryClient();
  const refreshFlags = async () =>
    await queryClient.invalidateQueries({ queryKey: supplierFlagsQueryKey(supplierId) });
  return useMutation({
    mutationFn: async (data: TInput) => await action({ data }),
    onSuccess: async (result) => {
      toast.success(successMessage(result));
      // The 3rd flag also turns the supplier off: its record and the supplier lists change too.
      await queryClient.invalidateQueries({ queryKey: ["admin-suppliers"] });
      onDone();
    },
    // A refusal (another team member already revoked it, or it expired meanwhile) means the
    // list on screen is stale: reload it so the flag no longer offers an action that fails.
    onError: refreshFlags,
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
      <BrokenRuleHint reason={value} />
    </div>
  );
}

/** Where the supplier stands before this flag: decides whether it is the 3rd strike. */
export interface FlagStanding {
  activeCount: number;
  supplierActive: boolean;
}

const CONFIRM_REQUIRED = "Marque a confirmação para desligar o fornecedor.";

/** The apply form's fields, its errors and the call; refuses the 3rd strike until confirmed. */
function useApplyFlagForm(supplierId: string, standing: FlagStanding, onClose: () => void) {
  const [reason, setReason] = useState<SupplierFlagReason | "">("");
  const [note, setNote] = useState("");
  const [confirmDeactivation, setConfirmDeactivation] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const apply = useFlagMutation(supplierId, teamApplySupplierFlag, appliedMessage, onClose);
  const deactivates = flagDeactivatesSupplier({
    activeFlagCount: standing.activeCount,
    supplierActive: standing.supplierActive,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmed = deactivates && confirmDeactivation;
    const parsed = applySupplierFlagSchema.safeParse({
      supplierId,
      reason,
      note,
      confirmDeactivation: confirmed,
    });
    const fieldErrors = parsed.success ? {} : issuesByField(parsed.error.issues);
    const confirmError = deactivates && !confirmed ? { confirm: CONFIRM_REQUIRED } : {};
    setErrors({ ...fieldErrors, ...confirmError });
    if (!parsed.success || deactivates !== confirmed) {
      return;
    }
    apply.mutate(parsed.data);
  }

  const fields = { reason, setReason, note, setNote, confirmDeactivation, setConfirmDeactivation };
  return { ...fields, errors, apply, deactivates, handleSubmit };
}

function ApplyFlagForm({
  supplierId,
  standing,
  onClose,
}: {
  supplierId: string;
  standing: FlagStanding;
  onClose: () => void;
}) {
  const form = useApplyFlagForm(supplierId, standing, onClose);
  const { reason, note, errors, apply, deactivates } = form;

  return (
    <form noValidate onSubmit={form.handleSubmit} className="grid gap-5">
      <FormErrorAlert message={apply.isError ? errorMessage(apply.error) : null} />
      <ReasonSelect
        value={reason}
        error={errors.reason}
        onChange={(value) => form.setReason(isFlagReason(value) ? value : "")}
      />
      <TextareaField
        id="flag-note"
        label={reason === "other" ? "Observação" : "Observação (opcional)"}
        hint="O fornecedor lê esta observação no painel"
        placeholder="Exemplo: o pedido 1234 saiu com a cor trocada."
        value={note}
        errors={errors.note === undefined ? [] : [errors.note]}
        onValueChange={form.setNote}
        rows={3}
        maxLength={TYPING_LIMIT}
      />
      {deactivates ? (
        <DeactivationConfirm
          activeCount={standing.activeCount}
          confirmed={form.confirmDeactivation}
          error={errors.confirm}
          onConfirmedChange={form.setConfirmDeactivation}
        />
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant={deactivates ? "destructive" : "default"}
          disabled={apply.isPending}
        >
          {applyLabel(apply.isPending, deactivates)}
        </Button>
      </DialogFooter>
    </form>
  );
}

function applyLabel(isPending: boolean, deactivates: boolean): string {
  if (isPending) {
    return "Aplicando…";
  }
  return deactivates ? "Aplicar e desligar" : "Aplicar flag";
}

/** "Aplicar flag": a reason and a note the supplier reads; it counts for 90 days. */
export function ApplyFlagDialog({
  supplierId,
  standing,
  open,
  onClose,
}: {
  supplierId: string;
  standing: FlagStanding;
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
            suporte. Na 3ª flag ativa a conta dele é desligada, depois da sua confirmação.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ApplyFlagForm supplierId={supplierId} standing={standing} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The revoke dialog's note, its error and the call; `close` forgets all three. */
function useRevokeFlag(supplierId: string, flagId: string | null, onClose: () => void) {
  const [revokeNote, setRevokeNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clearAndClose = () => {
    setRevokeNote("");
    setError(null);
    onClose();
  };
  const revoke = useFlagMutation(
    supplierId,
    teamRevokeSupplierFlag,
    () => "Flag retirada.",
    clearAndClose,
  );
  const close = () => {
    // The next flag's dialog must not open with the previous attempt's refusal.
    revoke.reset();
    clearAndClose();
  };
  const confirm = () => {
    const parsed = revokeSupplierFlagSchema.safeParse({ supplierId, flagId, revokeNote });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira a observação.");
      return;
    }
    setError(null);
    revoke.mutate(parsed.data);
  };
  return { revokeNote, setRevokeNote, error, revoke, close, confirm };
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
  const { revokeNote, setRevokeNote, error, revoke, close, confirm } = useRevokeFlag(
    supplierId,
    flagId,
    onClose,
  );

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
