import type { RequiredAttribute } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { attributeFieldLabel } from "@sellbridge/shared/supplier-product-attributes";
import { TextField } from "@/components/form/form-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  COMMON_ATTRIBUTES,
  descriptionLengthHint,
  inputIdOf,
  type PanelFormValues,
} from "@/features/supplier-panel/catalog/draft-form";
import { NO_GTIN } from "@sellbridge/shared/product-fiscal";
import type { SupplierTaxSetup } from "@sellbridge/shared/supplier-fiscal";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FieldReason, type ReasonsByField } from "./field-reason";
import { FiscalFields } from "./fiscal-fields";

/** Codes are typed as they are: no capital first letter, autocorrect or spell check. */
const CODE_INPUT = {
  autoCapitalize: "off",
  autoCorrect: "off",
  autoComplete: "off",
  spellCheck: false,
} as const;

/** Barcodes and package measures are typed as digits; the rest of the sheet is free text. */
const ATTRIBUTE_INPUTS: Readonly<Record<string, { inputMode: "numeric" }>> = {
  GTIN: { inputMode: "numeric" },
  SELLER_PACKAGE_WEIGHT: { inputMode: "numeric" },
  SELLER_PACKAGE_HEIGHT: { inputMode: "numeric" },
  SELLER_PACKAGE_WIDTH: { inputMode: "numeric" },
  SELLER_PACKAGE_LENGTH: { inputMode: "numeric" },
};

export interface StepProps {
  values: PanelFormValues;
  errors: Readonly<Record<string, string>>;
  reasons: ReasonsByField;
  onChange: (change: Partial<PanelFormValues>) => void;
}

const MAIN_FIELDS = [
  { field: "sku", key: "sku", label: "Código", inputMode: "text", code: true },
  { field: "title", key: "title", label: "Título", inputMode: "text", code: false },
  { field: "costCents", key: "cost", label: "Custo (R$)", inputMode: "decimal", code: false },
  {
    field: "suggestedPriceCents",
    key: "suggestedPrice",
    label: "Preço sugerido (R$)",
    inputMode: "decimal",
    code: false,
  },
  { field: "stock", key: "stock", label: "Estoque (un.)", inputMode: "numeric", code: false },
] as const;

function errorsOf(errors: Readonly<Record<string, string>>, field: string): string[] {
  const message = errors[field];
  return message === undefined ? [] : [message];
}

/** The category's required attributes first, then the common ones and any the product has. */
function attributeList(values: PanelFormValues, required: readonly RequiredAttribute[]) {
  const known = [...required, ...COMMON_ATTRIBUTES];
  const extra = Object.keys(values.attributes)
    .filter((id) => !known.some((attribute) => attribute.id === id))
    .map((id) => ({ id, label: attributeFieldLabel(id) }));
  const seen = new Set<string>();
  return [...known, ...extra].filter((attribute) => {
    if (seen.has(attribute.id)) {
      return false;
    }
    seen.add(attribute.id);
    return true;
  });
}

/** For the NF-e, a product without a barcode carries "SEM GTIN" in its GTIN field. */
function NoGtinCheckbox({ values, onChange }: Pick<StepProps, "values" | "onChange">) {
  const checked = values.attributes.GTIN === NO_GTIN;
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Checkbox
        id="panel-product-no-gtin"
        checked={checked}
        onCheckedChange={(next) =>
          onChange({ attributes: { ...values.attributes, GTIN: next === true ? NO_GTIN : "" } })
        }
      />
      <Label htmlFor="panel-product-no-gtin" className="font-normal">
        Não tem código de barras (SEM GTIN)
      </Label>
    </div>
  );
}

function AttributeFields({
  values,
  errors,
  reasons,
  onChange,
  required,
  showFiscal,
}: StepProps & { required: readonly RequiredAttribute[]; showFiscal: boolean }) {
  const requiredIds = new Set(required.map((attribute) => attribute.id));
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-3 text-subhead font-semibold">Ficha técnica</legend>
      {attributeList(values, required).map((attribute) => {
        const field = `attributes.${attribute.id}`;
        return (
          <div key={attribute.id} className="grid gap-2">
            <TextField
              id={inputIdOf(field)}
              label={
                requiredIds.has(attribute.id) ? `${attribute.label} (obrigatório)` : attribute.label
              }
              value={values.attributes[attribute.id] ?? ""}
              errors={errorsOf(errors, field)}
              onValueChange={(next) =>
                onChange({ attributes: { ...values.attributes, [attribute.id]: next } })
              }
              {...(ATTRIBUTE_INPUTS[attribute.id] === undefined
                ? {}
                : { ...CODE_INPUT, ...ATTRIBUTE_INPUTS[attribute.id] })}
            />
            <FieldReason field={field} reasons={reasons} />
            {showFiscal && attribute.id === "GTIN" ? (
              <NoGtinCheckbox values={values} onChange={onChange} />
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

export function StepDetails(
  props: StepProps & {
    required: readonly RequiredAttribute[];
    /** Set for a supplier's product (NF-e data); left out for a seller's own one. */
    taxDefaults?: SupplierTaxSetup | null | undefined;
  },
) {
  const { values, errors, reasons, onChange, taxDefaults } = props;
  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {MAIN_FIELDS.map((entry) => (
          <div
            key={entry.field}
            className={entry.field === "title" ? "grid gap-2 sm:col-span-2" : "grid gap-2"}
          >
            <TextField
              id={inputIdOf(entry.field)}
              label={entry.label}
              value={values[entry.key]}
              errors={errorsOf(errors, entry.field)}
              onValueChange={(next) => onChange({ [entry.key]: next })}
              inputMode={entry.inputMode}
              maxLength={entry.field === "title" ? 300 : undefined}
              {...(entry.code ? CODE_INPUT : {})}
            />
            <FieldReason field={entry.field} reasons={reasons} />
          </div>
        ))}
        <div className="grid gap-2 sm:col-span-2">
          <TextareaField
            id={inputIdOf("description")}
            label="Descrição"
            value={values.description}
            maxLength={20_000}
            rows={6}
            errors={errorsOf(errors, "description")}
            onValueChange={(description) => onChange({ description })}
          />
          <p className="text-footnote text-muted-foreground tabular-nums">
            {descriptionLengthHint(values.description.trim().length)}
          </p>
          <FieldReason field="description" reasons={reasons} />
        </div>
      </div>
      <AttributeFields {...props} showFiscal={taxDefaults !== undefined} />
      {taxDefaults === undefined ? null : (
        <FiscalFields
          values={values}
          errors={errors}
          reasons={reasons}
          onChange={onChange}
          taxDefaults={taxDefaults}
        />
      )}
    </div>
  );
}
