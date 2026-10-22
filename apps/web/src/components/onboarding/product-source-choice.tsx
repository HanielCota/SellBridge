import type { OnboardingProfile } from "@sellbridge/database/repositories";
import type { ProductSourceChoice } from "@sellbridge/shared/product-sources";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SupplierPicker } from "@/components/onboarding/supplier-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveOnboardingProductSources } from "@/features/onboarding/onboarding.functions";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { errorMessage } from "@/lib/errors";

/** The MVP sells only supplier products: the mode is always "suppliers" (the column stays). */
const SUPPLIERS_MODE = "suppliers" satisfies ProductSourceChoice["mode"];

function useSaveSources(onSaved: () => Promise<void>) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(choice: ProductSourceChoice) {
    setError(null);
    setIsSaving(true);
    try {
      await saveOnboardingProductSources({ data: choice });
    } catch (caught) {
      setError(errorMessage(caught));
      setIsSaving(false);
      return;
    }
    setIsSaved(true);
    try {
      await onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }
  return { save, isSaving, isSaved, error };
}

function useProductSourceChoice(profile: OnboardingProfile, onSaved: () => Promise<void>) {
  const initialSupplierId = profile.starterSupplier?.id ?? null;
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const saving = useSaveSources(onSaved);
  // An old own-only or mixed account saving the same supplier still moves to "suppliers".
  const dirty = supplierId !== initialSupplierId || profile.productSourceMode !== SUPPLIERS_MODE;
  const canDiscard = useUnsavedChanges(dirty && supplierId !== null && !saving.isSaved);
  const disabled = saving.isSaving || saving.isSaved || supplierId === null;
  return { supplierId, setSupplierId, saving, canDiscard, disabled };
}

function SourceChoiceActions({
  saving,
  disabled,
  onBack,
  onSave,
}: {
  saving: ReturnType<typeof useSaveSources>;
  disabled: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-3xl bg-card/90 p-2 backdrop-blur-xl">
      <Button
        type="button"
        variant="ghost"
        size="lg"
        disabled={saving.isSaving}
        onClick={() => {
          onBack();
        }}
      >
        <ArrowLeftIcon aria-hidden="true" />
        Voltar
      </Button>
      <Button
        type="button"
        size="lg"
        disabled={disabled}
        onClick={() => {
          onSave();
        }}
      >
        {saving.isSaved ? "Fornecedor salvo" : saving.isSaving ? "Salvando…" : "Salvar fornecedor"}
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ProductSourceChoice({
  profile,
  onBack,
  onSaved,
}: {
  profile: OnboardingProfile;
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const { supplierId, setSupplierId, saving, canDiscard, disabled } = useProductSourceChoice(
    profile,
    onSaved,
  );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <div className="space-y-1">
        <h2 className="text-subhead font-semibold">
          De qual fornecedor você vai vender os produtos?
        </h2>
        <p className="text-sm text-muted-foreground">
          O fornecedor guarda o estoque e envia os produtos aos seus clientes. Este será o
          fornecedor da sua próxima loja, e dá para trocar depois.
        </p>
      </div>
      <fieldset disabled={saving.isSaving || saving.isSaved} aria-label="Escolha do fornecedor">
        <SupplierPicker value={supplierId} onChange={(supplier) => setSupplierId(supplier.id)} />
      </fieldset>
      {saving.error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{saving.error}</AlertDescription>
        </Alert>
      )}
      <SourceChoiceActions
        saving={saving}
        disabled={disabled}
        onBack={() => {
          if (canDiscard()) onBack();
        }}
        onSave={() => {
          void saving.save({ mode: SUPPLIERS_MODE, supplierId });
        }}
      />
    </div>
  );
}
