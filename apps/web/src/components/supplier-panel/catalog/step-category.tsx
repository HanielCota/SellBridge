import { requiredAttributesFor } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { inputIdOf } from "@/features/supplier-panel/catalog/draft-form";
import type { CategoryOption } from "@/features/supplier-panel/catalog/use-product-form";
import { cn } from "@/lib/utils";
import { FieldReason } from "./field-reason";
import type { StepProps } from "./step-details";

/** What the marketplace will ask for, said before the supplier commits to a category. */
function requirementsHint(slug: string): string {
  const required = requiredAttributesFor(slug);
  if (required.length === 0) {
    return "Sem dados extras";
  }
  return `Pede ${required.map((attribute) => attribute.label.toLowerCase()).join(" e ")}`;
}

export function StepCategory({
  values,
  reasons,
  onChange,
  categories,
}: Omit<StepProps, "errors"> & { categories: readonly CategoryOption[] }) {
  return (
    <fieldset className="grid gap-4">
      <legend className="sr-only">Categoria do produto</legend>
      <FieldReason field="categoryId" reasons={reasons} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, index) => {
          const checked = values.categoryId === category.id;
          return (
            <label
              key={category.id}
              className={cn(
                "flex min-h-16 cursor-pointer items-start select-none justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors active:scale-[0.99] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/30",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-field-border bg-card hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="panel-product-category"
                id={index === 0 ? inputIdOf("categoryId") : undefined}
                value={category.id}
                checked={checked}
                onChange={() => onChange({ categoryId: category.id })}
                className="sr-only"
              />
              <span className="space-y-0.5">
                <span className="block font-medium">{category.name}</span>
                <span className="block text-footnote text-muted-foreground">
                  {requirementsHint(category.slug)}
                </span>
              </span>
              {checked ? (
                <CheckCircleIcon
                  weight="fill"
                  className="size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
