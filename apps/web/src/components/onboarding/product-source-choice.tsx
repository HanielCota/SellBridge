import type { OnboardingProfile } from "@sellbridge/database/repositories";
import {
  PRODUCT_SOURCE_LABELS,
  PRODUCT_SOURCE_MODES,
  type ProductSourceChoice,
  type ProductSourceMode,
} from "@sellbridge/shared/product-sources";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SupplierPicker } from "@/components/onboarding/supplier-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveOnboardingProductSources } from "@/features/onboarding/onboarding.functions";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { errorMessage } from "@/lib/errors";

const DESCRIPTIONS: Record<ProductSourceMode, string> = {
  own: "Cadastre seus produtos e cuide do estoque e do envio.",
  suppliers: "Escolha um fornecedor que mantém o estoque e envia os produtos aos seus clientes.",
  both: "Venda seus próprios produtos junto com produtos enviados por fornecedores.",
};

function SourceModePicker({
  value,
  onChange,
  disabled,
}: {
  value: ProductSourceMode;
  onChange: (value: ProductSourceMode) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-3">
      <legend className="mb-3 text-subhead font-semibold">Quais produtos você vai vender?</legend>
      {PRODUCT_SOURCE_MODES.map((mode) => (
        <label
          key={mode}
          aria-label={PRODUCT_SOURCE_LABELS[mode]}
          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 has-checked:border-brand has-checked:bg-brand/5"
        >
          <input
            type="radio"
            name="product-source-mode"
            value={mode}
            checked={value === mode}
            onChange={() => onChange(mode)}
            className="mt-1 accent-brand"
          />
          <span>
            <span className="block font-semibold">{PRODUCT_SOURCE_LABELS[mode]}</span>
            <span className="block text-sm text-muted-foreground">{DESCRIPTIONS[mode]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

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
  const initialMode = profile.productSourceMode ?? "suppliers";
  const initialSupplierId = profile.starterSupplier?.id ?? null;
  const [mode, setMode] = useState(initialMode);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const saving = useSaveSources(onSaved);
  const dirty = mode !== initialMode || (mode !== "own" && supplierId !== initialSupplierId);
  const canDiscard = useUnsavedChanges(dirty && !saving.isSaved);
  const disabled = saving.isSaving || saving.isSaved || (mode !== "own" && supplierId === null);
  return { mode, setMode, supplierId, setSupplierId, saving, canDiscard, disabled };
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
        {saving.isSaved
          ? "Origem dos produtos salva"
          : saving.isSaving
            ? "Salvando…"
            : "Salvar origem dos produtos"}
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
  const { mode, setMode, supplierId, setSupplierId, saving, canDiscard, disabled } =
    useProductSourceChoice(profile, onSaved);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <SourceModePicker
        value={mode}
        onChange={setMode}
        disabled={saving.isSaving || saving.isSaved}
      />
      <p className="text-sm text-muted-foreground">
        Você pode mudar esta escolha depois. Lojas, anúncios, estoque e pedidos existentes mantêm as
        configurações atuais. O fornecedor escolhido será o padrão da sua próxima loja.
      </p>
      {mode === "own" ? null : (
        <fieldset disabled={saving.isSaving || saving.isSaved} aria-label="Escolha do fornecedor">
          <SupplierPicker value={supplierId} onChange={(supplier) => setSupplierId(supplier.id)} />
        </fieldset>
      )}
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
          void saving.save({ mode, supplierId });
        }}
      />
    </div>
  );
}
