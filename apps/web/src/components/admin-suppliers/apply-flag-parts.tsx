import type { AppliedSupplierFlag } from "@sellbridge/database/repositories";
import { deactivatingFlagNotice, type SupplierFlagReason } from "@sellbridge/shared/supplier-flags";
import { goldenRuleForReason, goldenRuleLabel } from "@sellbridge/shared/supplier-golden-rules";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

/** Under the reason: the golden rule it breaks, in the words the supplier reads. */
export function BrokenRuleHint({ reason }: { reason: SupplierFlagReason | "" }) {
  if (reason === "") {
    return null;
  }
  const rule = goldenRuleForReason(reason);
  if (rule === null) {
    return (
      <p className="text-footnote text-muted-foreground">
        Sem regra de ouro ligada: conte na observação o que aconteceu.
      </p>
    );
  }
  return (
    <p className="text-footnote text-muted-foreground">
      Quebra a {goldenRuleLabel(rule)}. {rule.summary}
    </p>
  );
}

export function appliedMessage(result: AppliedSupplierFlag): string {
  if (result.supplierDeactivated) {
    return "Flag aplicada. O fornecedor foi desligado e os anúncios dele foram pausados.";
  }
  return "Flag aplicada.";
}

const CONFIRM_ERROR_ID = "flag-confirm-deactivation-error";

/** Three strikes: the flag that would be the 3rd active one says so and asks to confirm. */
export function DeactivationConfirm({
  activeCount,
  confirmed,
  error,
  onConfirmedChange,
}: {
  activeCount: number;
  confirmed: boolean;
  error: string | undefined;
  onConfirmedChange: (confirmed: boolean) => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{deactivatingFlagNotice(activeCount)}</AlertTitle>
      <AlertDescription className="space-y-3">
        {/* Full red: the alert's 90% red sits at 4.6:1 on the dark dialog, on the AA edge. */}
        <p className="text-destructive">
          Os produtos dele saem do catálogo e os anúncios dos revendedores são pausados. Só um
          administrador reativa a conta, pela ficha do fornecedor.
        </p>
        <div className="flex items-start gap-3">
          <Checkbox
            id="flag-confirm-deactivation"
            checked={confirmed}
            aria-invalid={error === undefined ? undefined : true}
            aria-describedby={error === undefined ? undefined : CONFIRM_ERROR_ID}
            onCheckedChange={(state) => onConfirmedChange(state === true)}
            className="mt-0.5"
          />
          <label htmlFor="flag-confirm-deactivation" className="text-sm text-foreground">
            Confirmo: aplicar a flag e desligar o fornecedor
          </label>
        </div>
        {error === undefined ? null : (
          <p id={CONFIRM_ERROR_ID} className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
