import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { MAX_MARKUP_PERCENT, MIN_MARKUP_PERCENT, type PriceRule } from "@sellbridge/shared/schemas";
import { CaretDownIcon, MinusIcon, PlusIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { displayStoreName } from "@/features/stores/store-name";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { PriceReceipt } from "./price-receipt";
import { skippedSummary } from "@/features/catalog/bulk-skip-reasons";
import { batchPriceProblem } from "@sellbridge/shared/fee-model";
import { priceForRule } from "@sellbridge/shared/schemas";
import { useFeeSchedule } from "@/features/reports/fee-schedule.queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { publishProductsInBulk } from "@/features/catalog/catalog.functions";
import {
  MARKUP_RANGE_MESSAGE,
  parseMarkupPercent,
  usePriceOverrides,
  usePriceRuleDraft,
} from "@/features/catalog/use-price-rule-draft";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export interface PublishStore {
  id: string;
  shopName: string;
  marketplace: string;
  /** Each store sells a single supplier; null while the seller has not picked one. */
  supplierId: string | null;
}

/** Stores that sell the supplier of every chosen product; none when they come from several. */
function storesForProducts(
  products: readonly SellableCatalogProduct[],
  stores: readonly PublishStore[],
): PublishStore[] {
  const supplierIds = new Set(products.map((product) => product.supplierId));
  const [only] = supplierIds;
  if (supplierIds.size !== 1 || only === undefined) {
    return [];
  }
  return stores.filter((store) => store.supplierId === only);
}

const MARKUP_STEP = 5;

function pluralize(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

/** An inset group of rows under a caption, like iOS settings. */
function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 px-3.5 text-xs text-muted-foreground">{title}</legend>
      <div className="divide-y divide-border overflow-hidden rounded-2xl bg-muted/60">
        {children}
      </div>
    </fieldset>
  );
}

/** "Loja Lote" when one store is on, "3 de 5 lojas" otherwise. */
function storeSummary(chosen: PublishStore[], stores: PublishStore[]): string {
  const [only] = chosen;
  if (chosen.length === 1 && only) {
    return displayStoreName(only.shopName);
  }
  if (chosen.length === 0) {
    return "Nenhuma loja escolhida";
  }
  return `${chosen.length} de ${pluralize(stores.length, "loja", "lojas")}`;
}

function StorePicker({
  stores,
  selected,
  onChange,
}: {
  stores: PublishStore[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const chosen = stores.filter((store) => selected.has(store.id));
  const toggle = (storeId: string, on: boolean) => {
    const next = new Set(selected);
    if (on) {
      next.add(storeId);
    }
    if (!on) {
      next.delete(storeId);
    }
    onChange(next);
  };
  return (
    <SettingsGroup title="Onde publicar">
      <StoreSummaryRow
        chosen={chosen}
        stores={stores}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      />
      {expanded
        ? stores.map((store) => (
            <StoreSwitchRow
              key={store.id}
              store={store}
              checked={selected.has(store.id)}
              onCheckedChange={(on) => toggle(store.id, on)}
            />
          ))
        : null}
    </SettingsGroup>
  );
}

/** Collapsed view of the store choice: stacked logos, a count and the toggle. */
function StoreSummaryRow({
  chosen,
  stores,
  expanded,
  onToggle,
}: {
  chosen: PublishStore[];
  stores: PublishStore[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
    >
      <span className="flex shrink-0" aria-hidden="true">
        {chosen.slice(0, 3).map((store) => (
          <MarketplaceMark
            key={store.id}
            marketplace={store.marketplace}
            className="-ml-2 size-7 rounded-lg ring-2 ring-popover first:ml-0"
          />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{storeSummary(chosen, stores)}</span>
      <span className="flex items-center gap-1 text-sm font-medium text-brand-text">
        {expanded ? "Fechar" : "Escolher"}
        <CaretDownIcon
          className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

function StoreSwitchRow({
  store,
  checked,
  onCheckedChange,
}: {
  store: PublishStore;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted">
      <MarketplaceMark marketplace={store.marketplace} className="size-8 rounded-lg" />
      <span className="min-w-0 flex-1 truncate text-sm">{displayStoreName(store.shopName)}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

const RULE_OPTIONS: { kind: PriceRule["kind"]; label: string }[] = [
  { kind: "markup", label: "Custo + margem" },
  { kind: "suggested", label: "Sugerido pelo fornecedor" },
];

/** Segmented control cut out of a muted track, like the period filter. */
function RuleSegments({
  kind,
  onKindChange,
}: {
  kind: PriceRule["kind"];
  onKindChange: (kind: PriceRule["kind"]) => void;
}) {
  return (
    <div className="p-2">
      <div className="flex h-9 items-center gap-0.5 rounded-full bg-muted p-1">
        {RULE_OPTIONS.map((option) => (
          <label
            key={option.kind}
            className={cn(
              "flex h-7 flex-1 cursor-pointer items-center justify-center rounded-full px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-[background-color,color,box-shadow] duration-150 hover:text-foreground",
              "has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-checked:ring-1 has-checked:ring-border",
              "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
            )}
          >
            <input
              type="radio"
              name="price-rule"
              checked={kind === option.kind}
              onChange={() => onKindChange(option.kind)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function clampMarkup(percent: number): number {
  return Math.min(MAX_MARKUP_PERCENT, Math.max(MIN_MARKUP_PERCENT, percent));
}

/**
 * Minus, typed percentage and plus in one pill, stepping by 5 within the allowed range. The
 * buttons are named after `stepNoun`, not `label`, so a label lookup finds only the input.
 */
function PercentStepper({
  label,
  stepNoun,
  percent,
  onPercentChange,
}: {
  label: string;
  stepNoun: string;
  percent: string;
  onPercentChange: (percent: string) => void;
}) {
  const current = Number.parseInt(percent, 10) || 0;
  const step = (delta: number) => onPercentChange(String(clampMarkup(current + delta)));
  return (
    <div className="flex shrink-0 items-center rounded-full bg-muted p-0.5">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Diminuir ${stepNoun}`}
        disabled={current <= MIN_MARKUP_PERCENT}
        onClick={() => step(-MARKUP_STEP)}
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <span className="flex items-center rounded-md text-sm font-medium tabular-nums has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
        <input
          aria-label={label}
          inputMode="numeric"
          value={percent}
          onChange={(event) => onPercentChange(event.target.value.replace(/\D/g, ""))}
          // 17px on phones: iOS zooms into any field under 16px when it gets focus.
          className="w-9 rounded-md bg-transparent text-right text-body outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-8 sm:text-sm"
        />
        %
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Aumentar ${stepNoun}`}
        disabled={current >= MAX_MARKUP_PERCENT}
        onClick={() => step(MARKUP_STEP)}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function MarkupStepper({
  percent,
  onPercentChange,
  percentValid,
  hint,
}: {
  percent: string;
  onPercentChange: (percent: string) => void;
  percentValid: boolean;
  hint: string;
}) {
  return (
    <div className="space-y-1 px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">Acréscimo sobre o custo</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <PercentStepper
          label="Acréscimo sobre o custo"
          stepNoun="acréscimo"
          percent={percent}
          onPercentChange={onPercentChange}
        />
      </div>
      {percentValid ? null : <p className="text-xs text-destructive">{MARKUP_RANGE_MESSAGE}</p>}
    </div>
  );
}

/**
 * Lets the product on screen leave the shared markup. Collapsed it is one quiet link; once
 * used it shows its own stepper and the shared value it replaced.
 */
function ProductMarkupAdjust({
  sharedPercent,
  percent,
  onPercentChange,
  onReset,
}: {
  sharedPercent: string;
  percent: string | undefined;
  onPercentChange: (percent: string) => void;
  onReset: () => void;
}) {
  if (percent === undefined) {
    return (
      <button
        type="button"
        onClick={() => onPercentChange(sharedPercent)}
        className="flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SlidersHorizontalIcon className="size-3.5" aria-hidden="true" />
        Usar outra margem neste produto
      </button>
    );
  }
  const valid = parseMarkupPercent(percent) !== null;
  return (
    <div className="space-y-1 rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">Margem deste produto</p>
          <p className="text-xs text-muted-foreground">
            Padrão {sharedPercent}% ·{" "}
            <button
              type="button"
              onClick={onReset}
              className="rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Voltar ao padrão
            </button>
          </p>
        </div>
        <PercentStepper
          label="Acréscimo deste produto"
          stepNoun="margem do produto"
          percent={percent}
          onPercentChange={onPercentChange}
        />
      </div>
      {valid ? null : <p className="text-xs text-destructive">{MARKUP_RANGE_MESSAGE}</p>}
    </div>
  );
}

/** "Arredondado para ,90", or how many products still follow the shared markup. */
function markupHint(total: number, adjusted: number): string {
  if (adjusted === 0) {
    return "Arredondado para ,90";
  }
  return `Vale para ${total - adjusted} de ${total} · arredondado para ,90`;
}

function PriceRulePicker({
  products,
  draft,
  overrides,
}: {
  products: SellableCatalogProduct[];
  draft: ReturnType<typeof usePriceRuleDraft>;
  overrides: ReturnType<typeof usePriceOverrides>;
}) {
  const isMarkup = draft.kind === "markup";
  const ruleFor = (product: SellableCatalogProduct) =>
    (isMarkup ? overrides.rules[product.id] : undefined) ?? draft.rule;
  // The markup the preview really applies: a half-typed shared value falls back to the default.
  const sharedPercent = draft.rule.kind === "markup" ? String(draft.rule.percent) : draft.percent;
  const adjust = (product: SellableCatalogProduct) => (
    <ProductMarkupAdjust
      sharedPercent={sharedPercent}
      percent={overrides.percentFor(product.id)}
      onPercentChange={(percent) => overrides.setPercent(product.id, percent)}
      onReset={() => overrides.clear(product.id)}
    />
  );
  return (
    <SettingsGroup title="Preço de venda">
      <RuleSegments kind={draft.kind} onKindChange={draft.setKind} />
      {isMarkup ? (
        <MarkupStepper
          percent={draft.percent}
          onPercentChange={draft.setPercent}
          percentValid={draft.percentValid}
          hint={markupHint(products.length, overrides.count)}
        />
      ) : null}
      <PriceReceipt
        products={products}
        ruleFor={ruleFor}
        adjust={isMarkup && products.length > 1 ? adjust : undefined}
      />
    </SettingsGroup>
  );
}

function noStoresMessage(products: readonly SellableCatalogProduct[], hasStores: boolean) {
  if (new Set(products.map((product) => product.supplierId)).size > 1) {
    return "Os produtos escolhidos são de fornecedores diferentes, e cada loja vende um único fornecedor. Selecione produtos de um fornecedor por vez.";
  }
  if (hasStores) {
    return "Nenhuma loja vende este fornecedor. Conecte uma loja para ele antes de publicar.";
  }
  return "Conecte uma loja antes de publicar.";
}

function NoStores({
  products,
  hasStores,
}: {
  products: readonly SellableCatalogProduct[];
  hasStores: boolean;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p>{noStoresMessage(products, hasStores)}</p>
      <Button asChild size="sm">
        <Link to="/lojas" hash="adicionar-loja">
          Conectar loja
        </Link>
      </Button>
    </div>
  );
}

function useBulkPublish(onDone: () => void) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      productIds: string[];
      storeConnectionIds: string[];
      priceRule: PriceRule;
      priceOverrides: Record<string, PriceRule>;
    }) => publishProductsInBulk({ data: input }),
    onSuccess: async ({ published, skipped }) => {
      const skippedNote = skipped.length > 0 ? ` · fora: ${skippedSummary(skipped)}` : "";
      toast.success(
        `${published} ${published === 1 ? "produto enviado" : "produtos enviados"} para publicação${skippedNote}`,
      );
      onDone();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["setup-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["sellable-catalog"] }),
        // The page it opens next lists them: a cached list from 30 s ago would not.
        queryClient.invalidateQueries({ queryKey: ["listings"] }),
      ]);
      await navigate({ to: "/publicacoes" });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/**
 * The batch's floor on screen, in the server's own words: a price rule that would lose money on
 * any product is said here, before the batch goes out to be refused.
 */
function useBatchFloorProblem(
  products: readonly SellableCatalogProduct[],
  draft: ReturnType<typeof usePriceRuleDraft>,
  overrides: ReturnType<typeof usePriceOverrides>,
): string | null {
  const schedule = useFeeSchedule();
  const isMarkup = draft.kind === "markup";
  return batchPriceProblem(
    products.map((product) => ({
      title: product.title,
      costCents: product.costCents,
      priceCents: priceForRule(
        product,
        (isMarkup ? overrides.rules[product.id] : undefined) ?? draft.rule,
      ),
    })),
    schedule,
  );
}

function FloorProblem({ problem }: { problem: string | null }) {
  if (problem === null) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {problem}
    </p>
  );
}

function BulkPublishForm({
  products,
  stores,
  onDone,
}: {
  products: SellableCatalogProduct[];
  stores: PublishStore[];
  onDone: () => void;
}) {
  const [storeIds, setStoreIds] = useState<ReadonlySet<string>>(
    new Set(stores.map((store) => store.id)),
  );
  const draft = usePriceRuleDraft();
  const overrides = usePriceOverrides();
  const mutation = useBulkPublish(onDone);
  const isMarkup = draft.kind === "markup";
  const adjusted = isMarkup ? overrides.count : 0;
  const floorProblem = useBatchFloorProblem(products, draft, overrides);
  const canSubmit =
    storeIds.size > 0 &&
    draft.isValid &&
    (!isMarkup || overrides.isValid) &&
    floorProblem === null &&
    !mutation.isPending;
  const listings = products.length * storeIds.size;
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          mutation.mutate({
            productIds: products.map((product) => product.id),
            storeConnectionIds: [...storeIds],
            priceRule: draft.rule,
            priceOverrides: isMarkup ? overrides.rules : {},
          });
        }
      }}
    >
      <StorePicker stores={stores} selected={storeIds} onChange={setStoreIds} />
      <PriceRulePicker products={products} draft={draft} overrides={overrides} />
      <div className="space-y-2">
        <FloorProblem problem={floorProblem} />
        <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
          {mutation.isPending
            ? "Publicando…"
            : `Publicar em ${pluralize(storeIds.size, "loja", "lojas")}`}
        </Button>
        <p className="text-center text-xs text-muted-foreground tabular-nums">
          {pluralize(products.length, "produto", "produtos")} ×{" "}
          {pluralize(storeIds.size, "loja", "lojas")} = {pluralize(listings, "anúncio", "anúncios")}
          {adjusted > 0 ? ` · ${adjusted} com margem própria` : null}
        </p>
      </div>
    </form>
  );
}

/** "Bermuda azul, Blusa verde e mais 3": names the selection without listing it all. */
function selectionSummary(products: SellableCatalogProduct[]): string {
  const named = products.slice(0, 2).map((product) => product.title);
  const rest = products.length - named.length;
  if (rest <= 0) {
    return named.join(" e ");
  }
  return `${named.join(", ")} e mais ${rest}`;
}

/** Publishes the selected catalog products to the chosen stores with one price rule. */
export function BulkPublishDialog({
  open,
  onOpenChange,
  products,
  stores,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: SellableCatalogProduct[];
  stores: PublishStore[];
}) {
  const eligible = storesForProducts(products, stores);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto rounded-[1.75rem] p-5 sm:max-w-md">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Publicar {pluralize(products.length, "produto", "produtos")}
          </DialogTitle>
          <DialogDescription className="truncate">{selectionSummary(products)}</DialogDescription>
        </DialogHeader>
        {eligible.length === 0 ? (
          <NoStores products={products} hasStores={stores.length > 0} />
        ) : (
          open && (
            <BulkPublishForm
              products={products}
              stores={eligible}
              onDone={() => onOpenChange(false)}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
