import type { AdminSupplier } from "@sellbridge/database/repositories";
import { adminSaveSupplierSchema } from "@sellbridge/shared/schemas";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/form/form-field";
import { TextareaField } from "@/components/form/textarea-field";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { SectionCard } from "@/components/layout/section-card";
import { adminSaveSupplier } from "@/features/admin-suppliers/suppliers.functions";
import { catalogFormErrors, supplierFormValues } from "@/features/admin-suppliers/form-values";
import { useCatalogAction } from "@/features/admin-suppliers/use-catalog-action";
import { errorMessage } from "@/lib/errors";
import { CoverageFields, StateField } from "./coverage-fields";

interface SupplierFormProps {
  detail?: { supplier: AdminSupplier; coverage: { state: string; city: string | null }[] };
  onSaved?: (supplier: AdminSupplier) => void;
}
const supplierFields = [
  { name: "name", label: "Nome", maximum: 150 },
  { name: "niche", label: "Nicho", maximum: 100 },
  { name: "city", label: "Cidade de origem", maximum: 120 },
  { name: "logoUrl", label: "URL do logo (opcional)", maximum: 2048 },
] as const;

function SupplierTextFields({
  values,
  errors,
  onChange,
}: {
  values: ReturnType<typeof supplierFormValues>;
  errors: Record<string, string[]>;
  onChange: (change: Partial<ReturnType<typeof supplierFormValues>>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {supplierFields.map((field) => (
        <TextField
          key={field.name}
          id={`supplier-${field.name}`}
          label={field.label}
          value={values[field.name]}
          maxLength={field.maximum}
          errors={errors[field.name] ?? []}
          onValueChange={(next) => onChange({ [field.name]: next })}
        />
      ))}
      <StateField
        id="supplier-state"
        label="UF de origem"
        value={values.state}
        onChange={(state) => onChange({ state })}
      />
    </div>
  );
}

export function SupplierForm({ detail, onSaved }: SupplierFormProps) {
  const [values, setValues] = useState(() => supplierFormValues(detail));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const save = useCatalogAction(adminSaveSupplier, "Fornecedor salvo", onSaved);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = adminSaveSupplierSchema.safeParse({
      ...values,
      supplierId: detail?.supplier.id,
      logoUrl: values.logoUrl.trim() || null,
      coverage: values.coverage.map((region) => ({
        state: region.state,
        city: region.city.trim() || null,
      })),
    });
    setErrors(parsed.success ? {} : catalogFormErrors(parsed.error));
    if (parsed.success) {
      save.mutate({ data: parsed.data });
    }
  }
  return (
    <SectionCard
      title={detail ? "Dados do fornecedor" : "Novo fornecedor"}
      description="Fornecedores atendem os revendedores das regiões cadastradas."
    >
      <form noValidate onSubmit={submit}>
        <fieldset disabled={save.isPending} className="grid gap-4">
          <SupplierTextFields
            values={values}
            errors={errors}
            onChange={(change) => setValues((current) => ({ ...current, ...change }))}
          />
          <TextareaField
            id="supplier-description"
            label="Descrição"
            value={values.description}
            maxLength={10_000}
            errors={errors.description ?? []}
            onValueChange={(description) => setValues((current) => ({ ...current, description }))}
          />
          <CoverageFields
            values={values.coverage}
            onChange={(coverage) => setValues((current) => ({ ...current, coverage }))}
          />
          <FormErrorAlert
            message={errors.coverage?.[0] ?? (save.isError ? errorMessage(save.error) : null)}
          />
          <div>
            <PendingSubmitButton
              isPending={save.isPending}
              idleLabel="Salvar fornecedor"
              pendingLabel="Salvando..."
            />
          </div>
        </fieldset>
      </form>
    </SectionCard>
  );
}
