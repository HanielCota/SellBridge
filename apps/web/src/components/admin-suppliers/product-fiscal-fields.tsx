import {
  maskNcmInput,
  PRODUCT_ORIGIN_LABELS,
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNITS,
} from "@sellbridge/shared/product-fiscal";
import { firstErrorMessage, TextField } from "@/components/form/form-field";
import { Label } from "@/components/ui/label";
import type { FiscalFormValues } from "@/features/supplier-panel/catalog/draft-form";

const SELECT_CLASS = "h-11 w-full rounded-xl border border-field-border bg-card px-3 text-body";

function FiscalSelect(props: {
  id: string;
  label: string;
  value: string;
  errors: readonly string[];
  placeholder: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
}) {
  const message = firstErrorMessage(props.errors);
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <select
        id={props.id}
        className={SELECT_CLASS}
        value={props.value}
        aria-invalid={message === null ? undefined : true}
        onChange={(event) => props.onValueChange(event.target.value)}
      >
        <option value="">{props.placeholder}</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {message === null ? null : <p className="text-sm text-destructive">{message}</p>}
    </div>
  );
}

const ORIGIN_OPTIONS = PRODUCT_ORIGIN_LABELS.map((label, origin) => ({
  value: String(origin),
  label,
}));
const UNIT_OPTIONS = PRODUCT_UNITS.map((unit) => ({
  value: unit,
  label: PRODUCT_UNIT_LABELS[unit],
}));

/**
 * The product's NF-e data in the team's form: NCM, origin, unit, CEST and net weight. The tax
 * codes stay with the supplier's defaults and overrides, kept as they are on save.
 */
export function ProductFiscalFields({
  values,
  errors,
  onChange,
}: {
  values: FiscalFormValues;
  errors: Record<string, string[]>;
  onChange: (fiscal: FiscalFormValues) => void;
}) {
  const change = (next: Partial<FiscalFormValues>) => onChange({ ...values, ...next });
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
      <FiscalSelect
        id="product-fiscal-origin"
        label="Origem"
        value={values.origin}
        errors={errors["fiscal.origin"] ?? []}
        placeholder="Escolha a origem"
        options={ORIGIN_OPTIONS}
        onValueChange={(origin) => change({ origin })}
      />
      <FiscalSelect
        id="product-fiscal-unit"
        label="Unidade"
        value={values.unit}
        errors={errors["fiscal.unit"] ?? []}
        placeholder="Escolha a unidade"
        options={UNIT_OPTIONS}
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
