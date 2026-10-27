import type { SupplierBrand } from "@sellbridge/database/repositories";
import { adminSupplierValuesSchema } from "@sellbridge/shared/schemas";
import { useState, type FormEvent } from "react";
import { catalogFormErrors, supplierFormInput } from "@/features/admin-suppliers/form-values";
import { useCatalogAction } from "@/features/admin-suppliers/use-catalog-action";
import {
  brandFormValues,
  hasBrandChanges,
  type BrandErrors,
  type BrandValues,
} from "@/features/supplier-panel/brand/brand-form-values";
import {
  createOwnBrandFn,
  updateOwnBrandFn,
} from "@/features/supplier-panel/brand/brand.functions";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { errorMessage } from "@/lib/errors";

interface BrandFormOptions {
  brand: SupplierBrand | null;
  loginEmail: string;
  onSaved: (brand: SupplierBrand) => void;
}

/**
 * State of the brand form: values against the last saved ones (for the save bar and the leave
 * warning), validation with the team's supplier schema, and the create or update call.
 */
export function useBrandForm({ brand, loginEmail, onSaved }: BrandFormOptions) {
  const isNew = brand === null;
  const [saved, setSaved] = useState(() => brandFormValues(brand, loginEmail));
  const [values, setValues] = useState(saved);
  const [errors, setErrors] = useState<BrandErrors>({});
  // Remounts the fields on discard so local state (the "Outra" niche text) resets too.
  const [resetCount, setResetCount] = useState(0);
  const isDirty = !isNew && hasBrandChanges(values, saved);
  useUnsavedChanges(isDirty);
  const save = useCatalogAction(
    isNew ? createOwnBrandFn : updateOwnBrandFn,
    isNew ? "Marca cadastrada" : "Dados da marca salvos",
    onSaved,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = adminSupplierValuesSchema.safeParse(supplierFormInput(values, undefined));
    setErrors(parsed.success ? {} : catalogFormErrors(parsed.error));
    if (!parsed.success) {
      return;
    }
    const submitted = values;
    save.mutate({ data: parsed.data }, { onSuccess: () => setSaved(submitted) });
  }

  return {
    values,
    errors,
    resetCount,
    isDirty,
    isPending: save.isPending,
    failure: save.isError ? errorMessage(save.error) : null,
    change: (next: Partial<BrandValues>) => setValues((current) => ({ ...current, ...next })),
    discard: () => {
      setValues(saved);
      setErrors({});
      setResetCount((count) => count + 1);
    },
    submit,
  };
}

export type BrandFormState = ReturnType<typeof useBrandForm>;
