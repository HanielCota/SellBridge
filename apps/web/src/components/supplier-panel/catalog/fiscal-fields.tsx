import { icmsCodeLabel, icmsCodeShortLabel, maskNcmInput } from "@sellbridge/shared/product-fiscal";
import type { SupplierTaxSetup } from "@sellbridge/shared/supplier-fiscal";
import { Link } from "@tanstack/react-router";
import { PRODUCT_ORIGIN_OPTIONS, PRODUCT_UNIT_OPTIONS } from "@/components/form/fiscal-options";
import { TextField } from "@/components/form/form-field";
import { SelectField } from "@/components/form/select-field";
import {
  inputIdOf,
  type PanelFormValues,
  type ProductFiscalFormValues,
} from "@/features/supplier-panel/catalog/draft-form";
import { FieldReason, type ReasonsByField } from "./field-reason";

interface FiscalFieldsProps {
  values: PanelFormValues;
  errors: Readonly<Record<string, string>>;
  reasons: ReasonsByField;
  onChange: (change: Partial<PanelFormValues>) => void;
  taxDefaults: SupplierTaxSetup | null;
}

function errorsOf(errors: Readonly<Record<string, string>>, field: string): string[] {
  const message = errors[field];
  return message === undefined ? [] : [message];
}

function useFiscalChange(props: FiscalFieldsProps) {
  return (change: Partial<ProductFiscalFormValues>) =>
    props.onChange({ fiscal: { ...props.values.fiscal, ...change } });
}

/** A typed code field of the block, with its hint under it when there is one. */
function FiscalTextField(props: {
  field: string;
  label: string;
  value: string;
  placeholder: string;
  errors: Readonly<Record<string, string>>;
  hint?: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <TextField
        id={inputIdOf(props.field)}
        label={props.label}
        value={props.value}
        placeholder={props.placeholder}
        inputMode="numeric"
        autoComplete="off"
        errors={errorsOf(props.errors, props.field)}
        onValueChange={props.onValueChange}
      />
      {props.hint === undefined ? null : (
        <p className="text-footnote text-muted-foreground">{props.hint}</p>
      )}
    </div>
  );
}

function ProductFiscalCodes(props: FiscalFieldsProps) {
  const { values, errors, reasons } = props;
  const change = useFiscalChange(props);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <FiscalTextField
          field="fiscal.ncm"
          label="NCM (código fiscal do produto, 8 números)"
          value={values.fiscal.ncm}
          placeholder="Ex.: 6109.10.00"
          errors={errors}
          onValueChange={(ncm) => change({ ncm: maskNcmInput(ncm) })}
        />
        <FieldReason field="fiscal.ncm" reasons={reasons} />
      </div>
      <SelectField
        id={inputIdOf("fiscal.origin")}
        label="Origem"
        value={values.fiscal.origin}
        error={errors["fiscal.origin"] ?? null}
        placeholder="Escolha a origem"
        options={PRODUCT_ORIGIN_OPTIONS}
        onValueChange={(origin) => change({ origin })}
      />
      <SelectField
        id={inputIdOf("fiscal.unit")}
        label="Unidade"
        hint="PAR para calçados, KIT para conjuntos"
        value={values.fiscal.unit}
        error={errors["fiscal.unit"] ?? null}
        placeholder="Escolha a unidade"
        options={PRODUCT_UNIT_OPTIONS}
        onValueChange={(unit) => change({ unit })}
      />
      <FiscalTextField
        field="fiscal.cest"
        label="CEST (opcional)"
        value={values.fiscal.cest}
        placeholder="Ex.: 2806300"
        hint="7 números. Deixe em branco se não souber."
        errors={errors}
        onValueChange={(cest) => change({ cest })}
      />
      <FiscalTextField
        field="fiscal.netWeightGrams"
        label="Peso do produto sem embalagem (g)"
        value={values.fiscal.netWeight}
        placeholder="Ex.: 300"
        errors={errors}
        onValueChange={(netWeight) => change({ netWeight })}
      />
    </div>
  );
}

function defaultsSummary(taxDefaults: SupplierTaxSetup): string {
  const { defaults, regime } = taxDefaults;
  return `CFOP ${defaults.cfopInState}/${defaults.cfopOutOfState} · ${icmsCodeShortLabel(regime)} ${defaults.icmsCode} · PIS/COFINS ${defaults.pisCofinsCst}`;
}

const OVERRIDE_KEYS = ["cfopInState", "cfopOutOfState", "icmsCode", "pisCofinsCst"] as const;

function overrideLabel(key: (typeof OVERRIDE_KEYS)[number], taxDefaults: SupplierTaxSetup) {
  const labels = {
    cfopInState: "CFOP dentro do estado",
    cfopOutOfState: "CFOP para outro estado",
    icmsCode: icmsCodeLabel(taxDefaults.regime),
    pisCofinsCst: "CST PIS/COFINS",
  };
  return labels[key];
}

function NoTaxDefaults() {
  return (
    <p className="text-sm text-muted-foreground">
      Impostos: preencha os padrões da sua empresa em{" "}
      <Link to="/fornecedor/painel/marca" className="font-medium text-brand-text underline">
        Marca → Dados fiscais da empresa
      </Link>
      . Eles valem para todos os produtos.
    </p>
  );
}

/** The tax codes: the brand's defaults, which one product may override. */
function TaxOverrides(props: FiscalFieldsProps) {
  const { values, errors, taxDefaults } = props;
  const change = useFiscalChange(props);
  if (taxDefaults === null) {
    return <NoTaxDefaults />;
  }
  const overridden = OVERRIDE_KEYS.some((key) => values.fiscal[key].trim() !== "");
  return (
    <details className="rounded-2xl border border-field-border px-4 py-3" open={overridden}>
      <summary className="cursor-pointer text-sm text-muted-foreground">
        Impostos: usando o padrão da marca ({defaultsSummary(taxDefaults)}) ·{" "}
        <span className="font-medium text-brand-text">Mudar só para este produto</span>
      </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {OVERRIDE_KEYS.map((key) => (
          <FiscalTextField
            key={key}
            field={`fiscal.${key}`}
            label={overrideLabel(key, taxDefaults)}
            value={values.fiscal[key]}
            placeholder={`Padrão: ${taxDefaults.defaults[key]}`}
            errors={errors}
            onValueChange={(next) => change({ [key]: next })}
          />
        ))}
        <p className="text-footnote text-muted-foreground sm:col-span-2">
          Deixe em branco para usar o padrão da marca.
        </p>
      </div>
    </details>
  );
}

/** "Dados fiscais (vão na nota fiscal)": what the supplier's ERP needs to issue the NF-e. */
export function FiscalFields(props: FiscalFieldsProps) {
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-1 text-subhead font-semibold">
        Dados fiscais (vão na nota fiscal)
      </legend>
      <p className="text-sm text-muted-foreground">
        Confira na nota de compra do produto. Os impostos já vêm do padrão da sua marca.
      </p>
      <ProductFiscalCodes {...props} />
      <TaxOverrides {...props} />
    </fieldset>
  );
}
