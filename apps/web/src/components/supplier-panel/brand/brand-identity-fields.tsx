import { StateField } from "@/components/admin-suppliers/state-field";
import { TextField } from "@/components/form/form-field";
import { BrandNicheField } from "@/components/supplier-panel/brand/brand-niche-field";
import type {
  BrandChange,
  BrandErrors,
  BrandValues,
} from "@/features/supplier-panel/brand/brand-form-values";

interface BrandIdentityFieldsProps {
  values: BrandValues;
  errors: BrandErrors;
  categoryNames: readonly string[];
  onChange: BrandChange;
}

/** Name, what the brand sells, and where it ships from: the fields resellers see first. */
export function BrandIdentityFields({
  values,
  errors,
  categoryNames,
  onChange,
}: BrandIdentityFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id="brand-name"
        label="Nome da marca"
        value={values.name}
        maxLength={150}
        errors={errors.name ?? []}
        onValueChange={(name) => onChange({ name })}
      />
      <BrandNicheField
        niche={values.niche}
        categoryNames={categoryNames}
        errors={errors.niche ?? []}
        onChange={(niche) => onChange({ niche })}
      />
      <TextField
        id="brand-city"
        label="Cidade de onde você envia"
        value={values.city}
        maxLength={120}
        errors={errors.city ?? []}
        onValueChange={(city) => onChange({ city })}
      />
      <StateField
        id="brand-state"
        label="Estado (UF)"
        value={values.state}
        onChange={(state) => onChange({ state })}
      />
    </div>
  );
}
