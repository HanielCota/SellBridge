import { formatCnpj } from "@sellbridge/shared/account-documents";
import { formatCep } from "@sellbridge/shared/billing-address";
import { BRAZILIAN_STATES } from "@sellbridge/shared/brazilian-states";
import {
  icmsCodeLabel,
  PRODUCT_ORIGIN_LABELS,
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNITS,
  TAX_REGIME_LABELS,
  TAX_REGIMES,
  type TaxRegime,
} from "@sellbridge/shared/product-fiscal";
import { defaultIcmsCode } from "@sellbridge/shared/supplier-fiscal";
import { useCallback } from "react";
import { firstErrorMessage, TextField } from "@/components/form/form-field";
import { SectionCard } from "@/components/layout/section-card";
import { Label } from "@/components/ui/label";
import type { FiscalFormValues } from "@/features/admin-suppliers/fiscal-form-values";
import type { CepAddress } from "@/features/cities/cep-lookup";
import { useCepAutofill } from "@/features/cities/use-cep-autofill";

interface BrandFiscalCardProps {
  values: FiscalFormValues;
  errors: Record<string, string[]>;
  onChange: (change: Partial<FiscalFormValues>) => void;
}

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-field-border bg-card px-3 text-body aria-invalid:border-destructive";

function errorsOf(errors: Record<string, string[]>, field: keyof FiscalFormValues): string[] {
  return errors[field] ?? [];
}

function FiscalSelect(props: {
  id: string;
  label: string;
  value: string;
  errors: readonly string[];
  options: readonly { value: string; label: string }[];
  placeholder?: string;
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
        {props.placeholder === undefined ? null : <option value="">{props.placeholder}</option>}
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

const REGIME_OPTIONS = TAX_REGIMES.map((regime) => ({
  value: regime,
  label: TAX_REGIME_LABELS[regime],
}));
const STATE_OPTIONS = BRAZILIAN_STATES.map((state) => ({ value: state, label: state }));
const ORIGIN_OPTIONS = PRODUCT_ORIGIN_LABELS.map((label, origin) => ({
  value: String(origin),
  label,
}));
const UNIT_OPTIONS = PRODUCT_UNITS.map((unit) => ({
  value: unit,
  label: PRODUCT_UNIT_LABELS[unit],
}));

function CompanyFields({ values, errors, onChange }: BrandFiscalCardProps) {
  const changeRegime = (next: string) => {
    const regime = TAX_REGIMES.find((option) => option === next) ?? "simples";
    // The other regime's usual code is swapped for this one's; a typed code is kept.
    const usual = values.fiscalIcmsCode === defaultIcmsCode(values.fiscalRegime);
    onChange({
      fiscalRegime: regime,
      ...(usual ? { fiscalIcmsCode: defaultIcmsCode(regime) } : {}),
    });
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id="brand-fiscal-cnpj"
        label="CNPJ"
        value={values.fiscalCnpj}
        inputMode="numeric"
        placeholder="00.000.000/0000-00"
        errors={errorsOf(errors, "fiscalCnpj")}
        onValueChange={(next) => onChange({ fiscalCnpj: formatCnpj(next) })}
      />
      <TextField
        id="brand-fiscal-legal-name"
        label="Razão social"
        value={values.fiscalLegalName}
        errors={errorsOf(errors, "fiscalLegalName")}
        onValueChange={(fiscalLegalName) => onChange({ fiscalLegalName })}
      />
      <div className="grid gap-2">
        <TextField
          id="brand-fiscal-state-registration"
          label="Inscrição estadual"
          value={values.fiscalStateRegistration}
          errors={errorsOf(errors, "fiscalStateRegistration")}
          onValueChange={(fiscalStateRegistration) => onChange({ fiscalStateRegistration })}
        />
        <p className="text-footnote text-muted-foreground">Não tem? Escreva ISENTO.</p>
      </div>
      <FiscalSelect
        id="brand-fiscal-regime"
        label="Regime tributário"
        value={values.fiscalRegime}
        errors={errorsOf(errors, "fiscalRegime")}
        options={REGIME_OPTIONS}
        onValueChange={changeRegime}
      />
    </div>
  );
}

function useAddressFromCep(onChange: BrandFiscalCardProps["onChange"]) {
  const apply = useCallback(
    (address: CepAddress) =>
      onChange({
        fiscalStreet: address.street,
        fiscalNeighborhood: address.neighborhood,
        fiscalCity: address.city,
        fiscalState: address.state,
        fiscalIbgeCode: address.ibgeCode,
      }),
    [onChange],
  );
  return useCepAutofill(apply);
}

/** The typed address lines after the CEP, with their width on wide screens. */
const ADDRESS_LINES = [
  { key: "fiscalStreet", id: "brand-fiscal-street", label: "Rua", span: "sm:col-span-4" },
  { key: "fiscalNumber", id: "brand-fiscal-number", label: "Número", span: "sm:col-span-2" },
  {
    key: "fiscalComplement",
    id: "brand-fiscal-complement",
    label: "Complemento (opcional)",
    span: "sm:col-span-4",
  },
  {
    key: "fiscalNeighborhood",
    id: "brand-fiscal-neighborhood",
    label: "Bairro",
    span: "sm:col-span-2",
  },
  { key: "fiscalCity", id: "brand-fiscal-city", label: "Cidade", span: "sm:col-span-3" },
] as const;

function CepField({ values, errors, onChange }: BrandFiscalCardProps) {
  const cep = useAddressFromCep(onChange);
  return (
    <div className="grid gap-1 sm:col-span-2">
      <TextField
        id="brand-fiscal-cep"
        label="CEP"
        value={values.fiscalCep}
        inputMode="numeric"
        autoComplete="postal-code"
        errors={errorsOf(errors, "fiscalCep")}
        onValueChange={(next) => {
          const masked = formatCep(next);
          onChange({ fiscalCep: masked });
          void cep.lookUp(masked);
        }}
      />
      <p aria-live="polite" className="text-footnote text-muted-foreground">
        {cep.message ?? "Digite o CEP: rua, bairro e cidade vêm sozinhos."}
      </p>
    </div>
  );
}

function AddressFields(props: BrandFiscalCardProps) {
  const { values, errors, onChange } = props;
  // A city typed by hand has no IBGE code: the CEP is what fills it.
  const changeLine = (key: (typeof ADDRESS_LINES)[number]["key"], next: string) =>
    onChange(key === "fiscalCity" ? { fiscalCity: next, fiscalIbgeCode: "" } : { [key]: next });
  return (
    <fieldset className="grid gap-4 sm:grid-cols-6">
      <legend className="mb-2 text-sm font-semibold">Endereço fiscal</legend>
      <CepField {...props} />
      {ADDRESS_LINES.map((line) => (
        <div key={line.key} className={line.span}>
          <TextField
            id={line.id}
            label={line.label}
            value={values[line.key]}
            errors={errorsOf(errors, line.key)}
            onValueChange={(next) => changeLine(line.key, next)}
          />
        </div>
      ))}
      <div className="sm:col-span-1">
        <FiscalSelect
          id="brand-fiscal-state"
          label="UF"
          value={values.fiscalState}
          errors={errorsOf(errors, "fiscalState")}
          options={STATE_OPTIONS}
          placeholder="UF"
          onValueChange={(fiscalState) => onChange({ fiscalState })}
        />
      </div>
    </fieldset>
  );
}

function DefaultsFields({ values, errors, onChange }: BrandFiscalCardProps) {
  const regime: TaxRegime = values.fiscalRegime;
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-semibold">Padrões dos produtos</legend>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Valem para todos os produtos. Um produto pode mudar só para ele. Na dúvida, confirme com o
        seu contador.
      </p>
      <TextField
        id="brand-fiscal-cfop-in-state"
        label="CFOP dentro do estado"
        value={values.fiscalCfopInState}
        inputMode="numeric"
        errors={errorsOf(errors, "fiscalCfopInState")}
        onValueChange={(fiscalCfopInState) => onChange({ fiscalCfopInState })}
      />
      <TextField
        id="brand-fiscal-cfop-out-of-state"
        label="CFOP para outro estado"
        value={values.fiscalCfopOutOfState}
        inputMode="numeric"
        errors={errorsOf(errors, "fiscalCfopOutOfState")}
        onValueChange={(fiscalCfopOutOfState) => onChange({ fiscalCfopOutOfState })}
      />
      <TextField
        id="brand-fiscal-icms-code"
        label={icmsCodeLabel(regime)}
        value={values.fiscalIcmsCode}
        inputMode="numeric"
        errors={errorsOf(errors, "fiscalIcmsCode")}
        onValueChange={(fiscalIcmsCode) => onChange({ fiscalIcmsCode })}
      />
      <TextField
        id="brand-fiscal-pis-cofins"
        label="CST PIS/COFINS"
        value={values.fiscalPisCofinsCst}
        inputMode="numeric"
        errors={errorsOf(errors, "fiscalPisCofinsCst")}
        onValueChange={(fiscalPisCofinsCst) => onChange({ fiscalPisCofinsCst })}
      />
      <FiscalSelect
        id="brand-fiscal-origin"
        label="Origem"
        value={values.fiscalOrigin}
        errors={errorsOf(errors, "fiscalOrigin")}
        options={ORIGIN_OPTIONS}
        onValueChange={(fiscalOrigin) => onChange({ fiscalOrigin })}
      />
      <FiscalSelect
        id="brand-fiscal-unit"
        label="Unidade"
        value={values.fiscalUnit}
        errors={errorsOf(errors, "fiscalUnit")}
        options={UNIT_OPTIONS}
        onValueChange={(fiscalUnit) => onChange({ fiscalUnit })}
      />
    </fieldset>
  );
}

/** "Dados fiscais da empresa": what the supplier's NF-e names, and its products' tax codes. */
export function BrandFiscalCard(props: BrandFiscalCardProps) {
  return (
    <SectionCard
      title="Dados fiscais da empresa"
      description="Vão nas notas fiscais que você emite para os revendedores. Só você e a equipe SellBridge veem."
    >
      <div className="grid gap-6">
        <CompanyFields {...props} />
        <AddressFields {...props} />
        <DefaultsFields {...props} />
      </div>
    </SectionCard>
  );
}
