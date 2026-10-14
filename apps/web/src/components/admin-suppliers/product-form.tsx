import type { AdminSupplierProduct } from "@sellbridge/database/repositories";
import { adminSaveProductSchema } from "@sellbridge/shared/schemas";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/form/form-field";
import { TextareaField } from "@/components/form/textarea-field";
import { FormErrorAlert, PendingSubmitButton } from "@/components/form/form-feedback";
import { SectionCard } from "@/components/layout/section-card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { adminSaveProduct } from "@/features/admin-suppliers/suppliers.functions";
import {
  catalogFormErrors,
  productFormInput,
  productFormValues,
} from "@/features/admin-suppliers/form-values";
import { useCatalogAction } from "@/features/admin-suppliers/use-catalog-action";
import { errorMessage } from "@/lib/errors";

interface ProductFormProps {
  supplierId: string;
  product?: AdminSupplierProduct | undefined;
  categories: { id: string; name: string }[];
  onClose: () => void;
}
const productFields = [
  { name: "sku", label: "SKU" },
  { name: "title", label: "Título" },
  { name: "cost", label: "Custo (R$)", error: "costCents" },
  { name: "suggestedPrice", label: "Preço sugerido (R$)", error: "suggestedPriceCents" },
  { name: "stock", label: "Estoque" },
] as const;

function ProductTextFields({
  values,
  errors,
  onChange,
}: {
  values: ReturnType<typeof productFormValues>;
  errors: Record<string, string[]>;
  onChange: (change: Partial<ReturnType<typeof productFormValues>>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {productFields.map((field) => (
        <TextField
          key={field.name}
          id={`product-${field.name}`}
          label={field.label}
          value={values[field.name]}
          errors={errors["error" in field ? field.error : field.name] ?? []}
          onValueChange={(next) => onChange({ [field.name]: next })}
          inputMode={["cost", "suggestedPrice", "stock"].includes(field.name) ? "decimal" : "text"}
        />
      ))}
    </div>
  );
}

function CategoryField({
  categories,
  value,
  onChange,
}: {
  categories: { id: string; name: string }[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="product-category">Categoria</Label>
      <select
        id="product-category"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-field-border bg-card px-3"
      >
        <option value="">Sem categoria</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProductFormActions({ isPending, onClose }: { isPending: boolean; onClose: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <PendingSubmitButton
        isPending={isPending}
        idleLabel="Salvar produto"
        pendingLabel="Salvando…"
      />
      <Button type="button" variant="outline" onClick={onClose}>
        Cancelar
      </Button>
    </div>
  );
}

function MercadoLivreAttributesField({
  value,
  errors,
  onChange,
}: {
  value: string;
  errors: string[];
  onChange: (value: string) => void;
}) {
  return (
    <TextareaField
      id="product-mercado-livre-attributes"
      label="Atributos do Mercado Livre (um por linha, como BRAND=Marca e MODEL=Modelo)"
      value={value}
      errors={errors}
      onValueChange={onChange}
    />
  );
}

export function ProductForm({ supplierId, product, categories, onClose }: ProductFormProps) {
  const [values, setValues] = useState(() => productFormValues(product));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const save = useCatalogAction(adminSaveProduct, "Produto salvo", onClose);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = adminSaveProductSchema.safeParse(productFormInput(values, supplierId, product));
    setErrors(parsed.success ? {} : catalogFormErrors(parsed.error));
    if (parsed.success) {
      save.mutate({ data: parsed.data });
    }
  }
  return (
    <SectionCard
      title={product ? "Editar produto" : "Novo produto"}
      description="O custo e os preços são informados em reais. A sincronização do anúncio usa o estoque atualizado."
    >
      <form noValidate onSubmit={submit}>
        <fieldset disabled={save.isPending} className="grid gap-4">
          <ProductTextFields
            values={values}
            errors={errors}
            onChange={(change) => setValues((current) => ({ ...current, ...change }))}
          />
          <TextareaField
            id="product-description"
            label="Descrição"
            value={values.description}
            maxLength={20_000}
            errors={errors.description ?? []}
            onValueChange={(description) => setValues((current) => ({ ...current, description }))}
          />
          <CategoryField
            categories={categories}
            value={values.categoryId}
            onChange={(categoryId) => setValues((current) => ({ ...current, categoryId }))}
          />
          <TextareaField
            id="product-images"
            label="URLs de imagem (uma por linha)"
            value={values.images}
            errors={errors.imageUrls ?? []}
            onValueChange={(images) => setValues((current) => ({ ...current, images }))}
          />
          <MercadoLivreAttributesField
            value={values.mercadoLivreAttributes}
            errors={errors.mercadoLivreAttributes ?? []}
            onChange={(mercadoLivreAttributes) =>
              setValues((current) => ({ ...current, mercadoLivreAttributes }))
            }
          />
          <FormErrorAlert message={save.isError ? errorMessage(save.error) : null} />
          <ProductFormActions isPending={save.isPending} onClose={onClose} />
        </fieldset>
      </form>
    </SectionCard>
  );
}
