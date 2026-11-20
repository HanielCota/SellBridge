import type { GroupingSuggestionProduct } from "@sellbridge/database/repositories";
import { MAX_GRID_OPTION_LENGTH } from "@sellbridge/shared/product-grid";
import { ProductVisual } from "@/components/catalog/product-visual";
import { TonePill } from "@/components/data/tone-status";
import { TextField } from "@/components/form/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { DraftProduct } from "@/features/supplier-panel/catalog/grouping/grouping-card";
import { cn } from "@/lib/utils";

const UNREAD_HINT = "Não deu para ler do nome: confira";

function stockLine(product: GroupingSuggestionProduct): string {
  const stock = `${product.stock} em estoque`;
  return product.reservedStock > 0 ? `${stock} · ${product.reservedStock} reservados` : stock;
}

function ListingPill({ live }: { live: number }) {
  if (live === 0) {
    return <TonePill tone="muted" label="Sem anúncio no ar" />;
  }
  return (
    <TonePill tone="success" label={live === 1 ? "1 anúncio no ar" : `${live} anúncios no ar`} />
  );
}

function OptionField({
  id,
  label,
  value,
  unread,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  unread: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <TextField
        id={id}
        label={label}
        value={value}
        errors={[]}
        maxLength={MAX_GRID_OPTION_LENGTH}
        disabled={disabled}
        onValueChange={onChange}
      />
      {unread && value.trim() === "" && !disabled ? (
        <p className="text-footnote text-amber-700 dark:text-amber-300">{UNREAD_HINT}</p>
      ) : null}
    </div>
  );
}

/** Problems announced as they appear; the list exists empty so screen readers hear them. */
export function ProblemList({ id, problems }: { id?: string; problems: readonly string[] }) {
  return (
    <ul id={id} className="grid gap-1 text-sm text-destructive empty:hidden" aria-live="polite">
      {problems.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  );
}

function ProductSummary({
  id,
  product,
  checked,
  onCheck,
}: {
  id: string;
  product: GroupingSuggestionProduct;
  checked: boolean;
  onCheck: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        className="mt-3"
        checked={checked}
        onCheckedChange={(next) => onCheck(next === true)}
        aria-label={`Juntar ${product.sku}`}
      />
      <ProductVisual
        imageUrl={product.imageUrl}
        title={product.title}
        categoryName={null}
        compact
        className="size-12 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor={id} className="font-medium break-all">
          {product.sku}
        </Label>
        <p className="line-clamp-2 text-footnote text-muted-foreground">{product.title}</p>
        <p className="text-footnote text-muted-foreground tabular-nums">{stockLine(product)}</p>
        <div className="flex flex-wrap gap-1.5">
          <ListingPill live={product.liveListings} />
          {product.active ? null : <TonePill tone="muted" label="Fora de venda" />}
        </div>
      </div>
    </div>
  );
}

function MainProductChoice({
  name,
  checked,
  disabled,
  onChoose,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:mt-6">
      <input
        type="radio"
        name={name}
        className="size-5 accent-brand"
        checked={checked}
        disabled={disabled}
        onChange={onChoose}
      />
      Produto principal
    </label>
  );
}

interface GroupingProductRowProps {
  product: GroupingSuggestionProduct;
  draft: DraftProduct;
  isMain: boolean;
  problems: readonly string[];
  /** One "main product" choice per suggestion. */
  radioGroup: string;
  onChange: (change: Partial<DraftProduct>) => void;
  onChooseMain: () => void;
}

/**
 * One product of a suggestion: whether it joins, its photo, SKU, stock and listings on the air,
 * the colour and size it takes, whether it is the main product, and what stops it.
 */
export function GroupingProductRow(props: GroupingProductRowProps) {
  const { product, draft, problems, onChange } = props;
  const id = `grouping-${product.id}`;
  return (
    <li
      className={cn(
        "grid gap-3 rounded-2xl border p-3",
        draft.checked ? "border-field-border bg-card" : "border-dashed border-field-border",
        problems.length > 0 && "border-destructive/60",
      )}
    >
      <ProductSummary
        id={`${id}-checked`}
        product={product}
        checked={draft.checked}
        onCheck={(checked) => onChange({ checked })}
      />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <OptionField
          id={`${id}-color`}
          label="Cor"
          value={draft.color}
          unread={product.color === null}
          disabled={!draft.checked}
          onChange={(color) => onChange({ color })}
        />
        <OptionField
          id={`${id}-size`}
          label="Tamanho"
          value={draft.size}
          unread={product.size === null}
          disabled={!draft.checked}
          onChange={(size) => onChange({ size })}
        />
        <MainProductChoice
          name={props.radioGroup}
          checked={props.isMain}
          disabled={!draft.checked}
          onChoose={props.onChooseMain}
        />
      </div>
      <ProblemList id={`${id}-problems`} problems={problems} />
    </li>
  );
}
