import type { SupplierBrand } from "@sellbridge/database/repositories";
import { adminSupplierValuesSchema, SUPPLIER_SLA_DEFAULTS } from "@sellbridge/shared/schemas";
import { useState, type FormEvent } from "react";
import { StateField } from "@/components/admin-suppliers/state-field";
import { SupplierContactFields } from "@/components/admin-suppliers/supplier-contact-fields";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { TextField } from "@/components/form/form-field";
import { TextareaField } from "@/components/form/textarea-field";
import { SectionCard } from "@/components/layout/section-card";
import { catalogFormErrors, supplierFormInput } from "@/features/admin-suppliers/form-values";
import { useCatalogAction } from "@/features/admin-suppliers/use-catalog-action";
import {
  createOwnBrandFn,
  updateOwnBrandFn,
} from "@/features/supplier-panel/brand/brand.functions";
import { errorMessage } from "@/lib/errors";
import { TERM_HINTS } from "@/components/icons/action-icons";

type BrandValues = ReturnType<typeof brandFormValues>;

/** Same shape as the team's supplier form (`supplierFormValues`), so its pieces fit here. */
function brandFormValues(brand: SupplierBrand | null, loginEmail: string) {
  return {
    name: brand?.name ?? "",
    niche: brand?.niche ?? "",
    state: brand?.state ?? "SP",
    city: brand?.city ?? "",
    description: brand?.description ?? "",
    logoUrl: "",
    contactEmail: brand === null ? loginEmail : (brand.contactEmail ?? ""),
    acceptWithinHours: String(brand?.acceptWithinHours ?? SUPPLIER_SLA_DEFAULTS.acceptWithinHours),
    dispatchWithinHours: String(
      brand?.dispatchWithinHours ?? SUPPLIER_SLA_DEFAULTS.dispatchWithinHours,
    ),
  };
}

const BRAND_FIELDS = [
  { name: "name", label: "Nome da marca", maximum: 150 },
  { name: "niche", label: "O que você vende (nicho)", maximum: 100 },
  { name: "city", label: "Cidade de onde você envia", maximum: 120 },
] as const;

function BrandFields({
  values,
  errors,
  onChange,
}: {
  values: BrandValues;
  errors: Record<string, string[]>;
  onChange: (change: Partial<BrandValues>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {BRAND_FIELDS.map((field) => (
        <TextField
          key={field.name}
          id={`brand-${field.name}`}
          label={field.label}
          value={values[field.name]}
          maxLength={field.maximum}
          errors={errors[field.name] ?? []}
          onValueChange={(next) => onChange({ [field.name]: next })}
        />
      ))}
      <StateField
        id="brand-state"
        label="Estado (UF)"
        value={values.state}
        onChange={(state) => onChange({ state })}
      />
    </div>
  );
}

interface BrandFormProps {
  readonly brand: SupplierBrand | null;
  readonly loginEmail: string;
  readonly onSaved: (brand: SupplierBrand) => void;
}

/**
 * "Sua marca" (no brand yet: name, niche, city and state) and "Dados da marca" (also the
 * description, the orders e-mail and the deadlines). A new brand gets the login e-mail for
 * orders and the default deadlines, both editable later.
 */
export function BrandForm({ brand, loginEmail, onSaved }: BrandFormProps) {
  const isNew = brand === null;
  const [values, setValues] = useState(() => brandFormValues(brand, loginEmail));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const save = useCatalogAction(
    isNew ? createOwnBrandFn : updateOwnBrandFn,
    isNew ? "Marca cadastrada" : "Dados da marca salvos",
    onSaved,
  );
  const change = (next: Partial<BrandValues>) => setValues((current) => ({ ...current, ...next }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = adminSupplierValuesSchema.safeParse(supplierFormInput(values, undefined));
    setErrors(parsed.success ? {} : catalogFormErrors(parsed.error));
    if (parsed.success) {
      save.mutate({ data: parsed.data });
    }
  }

  return (
    <SectionCard
      title={isNew ? "Cadastre sua marca" : "Dados da marca"}
      description={
        isNew
          ? "É assim que os revendedores vão conhecer você. Depois você cadastra os produtos e recebe os pedidos por aqui."
          : "Revendedores veem o nome, o nicho, a cidade e o estado. O e-mail e os prazos ficam só com você e a equipe SellBridge."
      }
    >
      <form noValidate onSubmit={submit}>
        <fieldset disabled={save.isPending} className="grid gap-4">
          <BrandFields values={values} errors={errors} onChange={change} />
          {isNew ? null : (
            <>
              <TextareaField
                id="brand-description"
                label="Descrição"
                hint={TERM_HINTS.brandDescription}
                value={values.description}
                maxLength={10_000}
                errors={errors.description ?? []}
                onValueChange={(description) => change({ description })}
              />
              <SupplierContactFields values={values} errors={errors} onChange={change} />
            </>
          )}
          <FormErrorAlert message={save.isError ? errorMessage(save.error) : null} />
          <div>
            <PendingSubmitButton
              isPending={save.isPending}
              idleLabel={isNew ? "Cadastrar marca" : "Salvar dados"}
              pendingLabel="Salvando…"
            />
          </div>
        </fieldset>
      </form>
    </SectionCard>
  );
}
