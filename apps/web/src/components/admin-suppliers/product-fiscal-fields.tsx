import { maskNcmInput } from "@sellbridge/shared/product-fiscal";
import { PRODUCT_ORIGIN_OPTIONS, PRODUCT_UNIT_OPTIONS } from "@/components/form/fiscal-options";
import { firstErrorMessage, TextField } from "@/components/form/form-field";
import { SelectField } from "@/components/form/select-field";
import type { ProductFiscalFormValues } from "@/features/supplier-panel/catalog/draft-form";

/**
 * The product's NF-e data in the team's form: NCM, origin, unit, CEST and net weight. The tax
 * codes stay with the supplier's defaults and overrides, kept as they are on save.
 */
export function ProductFiscalFields({
  values,
  errors,
  onChange,
}: {
  values: ProductFiscalFormValues;
  errors: Record<string, string[]>;
  onChange: (fiscal: ProductFiscalFormValues) => void;
}) {
  const change = (next: Partial<ProductFiscalFormValues>) => onChange({ ...values, ...next });
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-semibold">Dados fiscais (vão na nota fiscal)</legend>
      <TextField
        id="product-fiscal-ncm"
        label="NCM (8 números)"
        value={values.ncm}
        placeholder="Ex.: 6109.10.00"
        inputMode="numeric"
        errors={errors["fiscal.ncm"] ?? []}
        onValueChange={(ncm) => change({ ncm: maskNcmInput(ncm) })}
      />
      <SelectField
        id="product-fiscal-origin"
        label="Origem"
        value={values.origin}
        error={firstErrorMessage(errors["fiscal.origin"] ?? [])}
        placeholder="Escolha a origem"
        options={PRODUCT_ORIGIN_OPTIONS}
        onValueChange={(origin) => change({ origin })}
      />
      <SelectField
        id="product-fiscal-unit"
        label="Unidade"
        value={values.unit}
        error={firstErrorMessage(errors["fiscal.unit"] ?? [])}
        placeholder="Escolha a unidade"
        options={PRODUCT_UNIT_OPTIONS}
        onValueChange={(unit) => change({ unit })}
      />
      <TextField
        id="product-fiscal-cest"
        label="CEST (opcional)"
        value={values.cest}
        inputMode="numeric"
        errors={errors["fiscal.cest"] ?? []}
        onValueChange={(cest) => change({ cest })}
      />
      <TextField
        id="product-fiscal-net-weight"
        label="Peso do produto sem embalagem (g)"
        value={values.netWeight}
        inputMode="numeric"
        errors={errors["fiscal.netWeightGrams"] ?? []}
        onValueChange={(netWeight) => change({ netWeight })}
      />
    </fieldset>
  );
}
