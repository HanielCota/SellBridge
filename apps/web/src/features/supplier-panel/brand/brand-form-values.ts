import type { SupplierBrand } from "@sellbridge/database/repositories";
import { SUPPLIER_SLA_DEFAULTS } from "@sellbridge/shared/schemas";

/** Same shape as the team's supplier form (`supplierFormValues`), so its pieces fit here. */
export function brandFormValues(brand: SupplierBrand | null, loginEmail: string) {
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

export type BrandValues = ReturnType<typeof brandFormValues>;
export type BrandErrors = Record<string, string[]>;
export type BrandChange = (change: Partial<BrandValues>) => void;

/** True when any field differs from the last saved values (drives the save bar). */
export function hasBrandChanges(values: BrandValues, saved: BrandValues): boolean {
  const savedByField = new Map(Object.entries(saved));
  return Object.entries(values).some(([field, value]) => savedByField.get(field) !== value);
}
