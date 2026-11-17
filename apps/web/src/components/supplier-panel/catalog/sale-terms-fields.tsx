import {
  MAX_MADE_TO_ORDER_DAYS,
  WARRANTY_TYPE_LABELS,
  WARRANTY_TYPES,
} from "@sellbridge/shared/product-sale-terms";
import { SelectField } from "@/components/form/select-field";
import { TextField } from "@/components/form/form-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { inputIdOf, type PanelFormValues } from "@/features/supplier-panel/catalog/draft-form";
import {
  saleTermsMissing,
  type SaleTermsFormValues,
} from "@/features/supplier-panel/catalog/sale-terms-form";

interface SaleTermsProps {
  values: PanelFormValues;
  errors: Readonly<Record<string, string>>;
  onChange: (change: Partial<PanelFormValues>) => void;
}

const WARRANTY_OPTIONS = WARRANTY_TYPES.map((type) => ({
  value: type,
  label: WARRANTY_TYPE_LABELS[type],
}));

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex min-h-11 items-start gap-3 sm:col-span-2">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hintId}
        className="mt-0.5"
      />
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={hintId} className="text-footnote text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}

function errorList(
  errors: Readonly<Record<string, string>>,
  missing: Record<string, string>,
  field: string,
) {
  const message = errors[field] ?? missing[field];
  return message === undefined ? [] : [message];
}

interface TermsPartProps {
  terms: SaleTermsFormValues;
  errors: Readonly<Record<string, string>>;
  missing: Record<string, string>;
  change: (next: Partial<SaleTermsFormValues>) => void;
}

function WarrantyFields({ terms, errors, missing, change }: TermsPartProps) {
  const hasWarranty = terms.warrantyType === "seller" || terms.warrantyType === "factory";
  return (
    <>
      <SelectField
        id={inputIdOf("warrantyType")}
        label="Garantia"
        value={terms.warrantyType}
        error={errors.warrantyType ?? null}
        placeholder="Escolha"
        options={WARRANTY_OPTIONS}
        onValueChange={(warrantyType) =>
          change({ warrantyType: WARRANTY_TYPES.find((type) => type === warrantyType) ?? "" })
        }
      />
      {hasWarranty ? (
        <TextField
          id={inputIdOf("warrantyDays")}
          label="Tempo de garantia (dias)"
          value={terms.warrantyDays}
          errors={errorList(errors, missing, "warrantyDays")}
          inputMode="numeric"
          placeholder="Ex.: 90"
          onValueChange={(warrantyDays) => change({ warrantyDays })}
        />
      ) : null}
    </>
  );
}

function MadeToOrderFields({ terms, errors, missing, change }: TermsPartProps) {
  return (
    <>
      <SwitchRow
        id={inputIdOf("madeToOrder")}
        label="Produto sob encomenda"
        hint="Só se o produto é feito depois da venda. O Mercado Livre mostra o prazo ao comprador e dá menos destaque ao anúncio."
        checked={terms.madeToOrder}
        onCheckedChange={(madeToOrder) => change({ madeToOrder })}
      />
      {terms.madeToOrder ? (
        <TextField
          id={inputIdOf("madeToOrderDays")}
          label={`Dias para ficar pronto (até ${MAX_MADE_TO_ORDER_DAYS})`}
          value={terms.madeToOrderDays}
          errors={errorList(errors, missing, "madeToOrderDays")}
          inputMode="numeric"
          placeholder="Ex.: 5"
          onValueChange={(madeToOrderDays) => change({ madeToOrderDays })}
        />
      ) : null}
    </>
  );
}

/** Warranty, video, made-to-order time and carrier-only: what the listing promises the buyer. */
export function SaleTermsFields({ values, errors, onChange }: SaleTermsProps) {
  const terms = values.saleTerms;
  const parts = {
    terms,
    errors,
    missing: saleTermsMissing(terms),
    change: (next: Partial<SaleTermsFormValues>) => onChange({ saleTerms: { ...terms, ...next } }),
  };
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-3 text-subhead font-semibold">Garantia e envio</legend>
      <WarrantyFields {...parts} />
      <div className="grid gap-2 sm:col-span-2">
        <TextField
          id={inputIdOf("videoUrl")}
          label="Vídeo do produto no YouTube (opcional)"
          value={terms.videoUrl}
          errors={errorList(errors, parts.missing, "videoUrl")}
          inputMode="url"
          placeholder="Ex.: https://youtu.be/abc123DEF45"
          onValueChange={(videoUrl) => parts.change({ videoUrl })}
        />
      </div>
      <MadeToOrderFields {...parts} />
      <SwitchRow
        id={inputIdOf("carrierOnly")}
        label="Somente transportadora"
        hint="Grande ou pesado demais para os Correios: só vai por transportadora."
        checked={terms.carrierOnly}
        onCheckedChange={(carrierOnly) => parts.change({ carrierOnly })}
      />
    </fieldset>
  );
}
