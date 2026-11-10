import {
  icmsCodeLabel,
  maskNcmInput,
  PRODUCT_ORIGIN_LABELS,
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNITS,
} from "@sellbridge/shared/product-fiscal";
import type { SupplierTaxDefaults } from "@sellbridge/shared/supplier-fiscal";
import type { TaxRegime } from "@sellbridge/shared/product-fiscal";
import { Link } from "@tanstack/react-router";
import { TextField } from "@/components/form/form-field";
import { Label } from "@/components/ui/label";
import {
  inputIdOf,
  type FiscalFormValues,
  type PanelFormValues,
} from "@/features/supplier-panel/catalog/draft-form";
import { FieldReason, type ReasonsByField } from "./field-reason";

/** The supplier's regime and default tax codes, from "Dados fiscais da empresa"; null until set. */
export interface ProductTaxDefaults {
  readonly regime: TaxRegime;
  readonly defaults: SupplierTaxDefaults;
}

interface FiscalFieldsProps {
  values: PanelFormValues;
  errors: Readonly<Record<string, string>>;
  reasons: ReasonsByField;
  onChange: (change: Partial<PanelFormValues>) => void;
  taxDefaults: ProductTaxDefaults | null;
}

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-field-border bg-card px-3 text-body aria-invalid:border-destructive";

function errorsOf(errors: Readonly<Record<string, string>>, field: string): string[] {
  const message = errors[field];
  return message === undefined ? [] : [message];
}

function useFiscalChange(props: FiscalFieldsProps) {
  return (change: Partial<FiscalFormValues>) =>
    props.onChange({ fiscal: { ...props.values.fiscal, ...change } });
}

function FiscalSelect(props: {
  field: string;
  label: string;
  hint?: string;
  value: string;
  error: string | undefined;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
}) {
  const id = inputIdOf(props.field);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{props.label}</Label>
      <select
        id={id}
        className={SELECT_CLASS}
        value={props.value}
        aria-invalid={props.error === undefined ? undefined : true}
        aria-describedby={props.error === undefined ? undefined : `${id}-error`}
        onChange={(event) => props.onValueChange(event.target.value)}
      >
        <option value="">{props.placeholder}</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {props.error === undefined ? null : (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {props.error}
        </p>
      )}
      {props.hint === undefined ? null : (
        <p className="text-footnote text-muted-foreground">{props.hint}</p>
      )}
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
      <FiscalSelect
        field="fiscal.origin"
        label="Origem"
        value={values.fiscal.origin}
        error={errors["fiscal.origin"]}
        placeholder="Escolha a origem"
        options={ORIGIN_OPTIONS}
        onValueChange={(origin) => change({ origin })}
      />
      <FiscalSelect
        field="fiscal.unit"
        label="Unidade"
        hint="PAR para calçados, KIT para conjuntos"
        value={values.fiscal.unit}
        error={errors["fiscal.unit"]}
        placeholder="Escolha a unidade"
        options={UNIT_OPTIONS}
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

function defaultsSummary(taxDefaults: ProductTaxDefaults): string {
  const { defaults, regime } = taxDefaults;
  const icms = regime === "simples" ? "CSOSN" : "CST ICMS";
  return `CFOP ${defaults.cfopInState}/${defaults.cfopOutOfState} · ${icms} ${defaults.icmsCode} · PIS/COFINS ${defaults.pisCofinsCst}`;
}

const OVERRIDE_KEYS = ["cfopInState", "cfopOutOfState", "icmsCode", "pisCofinsCst"] as const;

function overrideLabel(key: (typeof OVERRIDE_KEYS)[number], taxDefaults: ProductTaxDefaults) {
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
