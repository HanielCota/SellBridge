import type { PanelFormValues } from "@/features/supplier-panel/catalog/draft-form";
import type { SellerProductFormData } from "@/features/seller-products/use-product-editor";
import { COMMON_ATTRIBUTES } from "@/features/supplier-panel/catalog/draft-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FIELDS = [
  { key: "sku", label: "SKU" },
  { key: "title", label: "Nome do produto" },
  { key: "cost", label: "Custo por unidade (R$)" },
  { key: "suggestedPrice", label: "Preço de venda (R$)" },
  { key: "stock", label: "Estoque total" },
] as const;
interface FieldsProps {
  values: PanelFormValues;
  onChange: (values: Partial<PanelFormValues>) => void;
}
interface ProductFieldsProps extends FieldsProps {
  reservedStock: number;
  categories: SellerProductFormData["categories"];
  required: readonly { id: string; label: string }[];
}

function TextFields({ values, onChange, reservedStock }: FieldsProps & { reservedStock: number }) {
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
          {key === "stock" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Inclui {reservedStock}{" "}
              {reservedStock === 1 ? "unidade reservada" : "unidades reservadas"}. As reservas não
              ficam disponíveis para novas vendas.
            </p>
          ) : null}
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
        Dados do marketplace e medidas da embalagem
      </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {attributes.map((id) => (
          <div key={id}>
            <Label htmlFor={`seller-attribute-${id}`}>
              {required.find((item) => item.id === id)?.label ??
                COMMON_ATTRIBUTES.find((item) => item.id === id)?.label ??
                id}
              {required.some((item) => item.id === id) ? "(obrigatório)" : ""}
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

export function ProductFields({
  values,
  onChange,
  categories,
  required,
  reservedStock,
}: ProductFieldsProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextFields values={values} onChange={onChange} reservedStock={reservedStock} />
      <div>
        <Label htmlFor="seller-category">Categoria</Label>
        <select
          id="seller-category"
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3"
          value={values.categoryId}
          onChange={(event) => onChange({ categoryId: event.target.value })}
        >
          <option value="">Escolha uma categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="seller-description">Descrição</Label>
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
