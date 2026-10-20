import type { PanelFormValues } from "@/features/supplier-panel/catalog/draft-form";
import type { SellerProductFormData } from "@/features/seller-products/use-product-editor";
import { COMMON_ATTRIBUTES } from "@/features/supplier-panel/catalog/draft-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FIELDS = [
  { key: "sku", label: "SKU" },
  { key: "title", label: "Product title" },
  { key: "cost", label: "Unit cost (BRL)" },
  { key: "suggestedPrice", label: "Selling price (BRL)" },
  { key: "stock", label: "Stock on hand" },
] as const;
interface FieldsProps {
  values: PanelFormValues;
  onChange: (values: Partial<PanelFormValues>) => void;
}
interface ProductFieldsProps extends FieldsProps {
  categories: SellerProductFormData["categories"];
  required: readonly { id: string; label: string }[];
}

function TextFields({ values, onChange }: FieldsProps) {
  return (
    <>
      {FIELDS.map(({ key, label }) => (
        <div key={key} className={key === "title" ? "sm:col-span-2" : ""}>
          <Label htmlFor={`seller-${key}`}>{label}</Label>
          <Input
            id={`seller-${key}`}
            value={values[key]}
            inputMode={
              key === "stock"
                ? "numeric"
                : key === "cost" || key === "suggestedPrice"
                  ? "decimal"
                  : "text"
            }
            onChange={(event) => onChange({ [key]: event.target.value })}
          />
        </div>
      ))}
    </>
  );
}

function ProductAttributes({
  values,
  onChange,
  required,
}: FieldsProps & Pick<ProductFieldsProps, "required">) {
  const attributes = [
    ...new Set([...required.map((item) => item.id), ...COMMON_ATTRIBUTES.map((item) => item.id)]),
  ];
  return (
    <details className="sm:col-span-2 rounded-xl border border-border p-4">
      <summary className="cursor-pointer font-medium">
        Marketplace attributes and package measurements
      </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {attributes.map((id) => (
          <div key={id}>
            <Label htmlFor={`seller-attribute-${id}`}>
              {id.replaceAll("_", " ")}
              {required.some((item) => item.id === id) ? " (required)" : ""}
            </Label>
            <Input
              id={`seller-attribute-${id}`}
              value={values.attributes[id] ?? ""}
              onChange={(event) =>
                onChange({ attributes: { ...values.attributes, [id]: event.target.value } })
              }
            />
          </div>
        ))}
      </div>
    </details>
  );
}

export function ProductFields({ values, onChange, categories, required }: ProductFieldsProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextFields values={values} onChange={onChange} />
      <div>
        <Label htmlFor="seller-category">Category</Label>
        <select
          id="seller-category"
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3"
          value={values.categoryId}
          onChange={(event) => onChange({ categoryId: event.target.value })}
        >
          <option value="">Choose a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="seller-description">Description</Label>
        <Textarea
          id="seller-description"
          rows={6}
          value={values.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </div>
      <ProductAttributes values={values} onChange={onChange} required={required} />
    </div>
  );
}
