import type { SupplierBrand } from "@sellbridge/database/repositories";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { SectionCard } from "@/components/layout/section-card";
import { BrandIdentityFields } from "@/components/supplier-panel/brand/brand-identity-fields";
import { BrandOrdersCard } from "@/components/supplier-panel/brand/brand-orders-card";
import { BrandPublicCard } from "@/components/supplier-panel/brand/brand-public-card";
import { BrandSaveBar } from "@/components/supplier-panel/brand/brand-save-bar";
import { useBrandForm, type BrandFormState } from "@/features/supplier-panel/brand/use-brand-form";

interface BrandFormProps {
  readonly brand: SupplierBrand | null;
  readonly loginEmail: string;
  readonly categoryNames: readonly string[];
  readonly onSaved: (brand: SupplierBrand) => void;
}

/** "Cadastre sua marca": only what resellers need to find the brand; the rest comes later. */
function NewBrandForm({
  form,
  categoryNames,
}: {
  form: BrandFormState;
  categoryNames: readonly string[];
}) {
  return (
    <SectionCard
      title="Cadastre sua marca"
      description="É assim que os revendedores vão conhecer você. Depois você cadastra os produtos e recebe os pedidos por aqui."
    >
      <form noValidate onSubmit={form.submit}>
        <fieldset disabled={form.isPending} className="grid gap-4">
          <BrandIdentityFields
            values={form.values}
            errors={form.errors}
            categoryNames={categoryNames}
            onChange={form.change}
          />
          <FormErrorAlert message={form.failure} />
          <div>
            <PendingSubmitButton
              isPending={form.isPending}
              idleLabel="Cadastrar marca"
              pendingLabel="Salvando…"
            />
          </div>
        </fieldset>
      </form>
    </SectionCard>
  );
}

/**
 * "Cadastre sua marca" (no brand yet) or, once it exists, the public card with its catalog
 * preview plus the private "Pedidos" card, saved from a bar that shows only with changes.
 */
export function BrandForm({ brand, loginEmail, categoryNames, onSaved }: BrandFormProps) {
  const form = useBrandForm({ brand, loginEmail, onSaved });
  if (brand === null) {
    return <NewBrandForm form={form} categoryNames={categoryNames} />;
  }
  return (
    <form noValidate onSubmit={form.submit} className="grid gap-6">
      <fieldset key={form.resetCount} disabled={form.isPending} className="grid min-w-0 gap-6">
        <BrandPublicCard
          values={form.values}
          errors={form.errors}
          categoryNames={categoryNames}
          logoUrl={brand.logoUrl}
          onChange={form.change}
        />
        <BrandOrdersCard values={form.values} errors={form.errors} onChange={form.change} />
      </fieldset>
      <FormErrorAlert message={form.failure} />
      {form.isDirty ? <BrandSaveBar isPending={form.isPending} onDiscard={form.discard} /> : null}
    </form>
  );
}
