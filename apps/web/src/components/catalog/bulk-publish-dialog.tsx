import type { RegionCatalogProduct } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { priceForRule, type PriceRule } from "@sellbridge/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { displayStoreName } from "@/features/stores/store-name";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { publishProductsInBulk } from "@/features/catalog/catalog.functions";
import { estimateProfit } from "@/features/listings/profit";
import { MARKUP_RANGE_MESSAGE, usePriceRuleDraft } from "@/features/catalog/use-price-rule-draft";
import { errorMessage } from "@/lib/errors";

export interface PublishStore {
  id: string;
  shopName: string;
  marketplace: string;
}

const PREVIEW_ROWS = 4;

function StorePicker({
  stores,
  selected,
  onChange,
}: {
  stores: PublishStore[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Lojas</legend>
      {stores.map((store) => (
        <label
          key={store.id}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50 has-checked:bg-muted/60"
        >
          <Checkbox
            checked={selected.has(store.id)}
            onCheckedChange={(checked) => {
              const next = new Set(selected);
              if (checked === true) {
                next.add(store.id);
              }
              if (checked !== true) {
                next.delete(store.id);
              }
              onChange(next);
            }}
          />
          <MarketplaceMark marketplace={store.marketplace} className="size-8 rounded-xl" />
          <span className="text-sm">{displayStoreName(store.shopName)}</span>
        </label>
      ))}
    </fieldset>
  );
}

function RuleOption({
  checked,
  onSelect,
  title,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50 has-checked:border-brand has-checked:bg-muted/60">
      <input
        type="radio"
        name="price-rule"
        checked={checked}
        onChange={onSelect}
        className="mt-1 accent-[var(--brand)]"
      />
      <span className="flex-1 space-y-2">
        <span className="block text-sm font-medium">{title}</span>
        {children}
      </span>
    </label>
  );
}

function PriceRulePicker({
  kind,
  onKindChange,
  percent,
  onPercentChange,
  percentValid,
}: {
  kind: PriceRule["kind"];
  onKindChange: (kind: PriceRule["kind"]) => void;
  percent: string;
  onPercentChange: (percent: string) => void;
  percentValid: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Preço de venda</legend>
      <RuleOption
        checked={kind === "markup"}
        onSelect={() => onKindChange("markup")}
        title="Custo + margem"
      >
        <span className="flex items-center gap-2">
          <Input
            aria-label="Percentual sobre o custo"
            inputMode="numeric"
            value={percent}
            onChange={(event) => onPercentChange(event.target.value.replace(/\D/g, ""))}
            onFocus={() => onKindChange("markup")}
            className="h-9 w-20"
          />
          <span className="text-sm text-muted-foreground">% sobre o custo, terminando em ,90</span>
        </span>
        {kind === "markup" && !percentValid ? (
          <span className="block text-xs text-destructive">{MARKUP_RANGE_MESSAGE}</span>
        ) : null}
      </RuleOption>
      <RuleOption
        checked={kind === "suggested"}
        onSelect={() => onKindChange("suggested")}
        title="Preço sugerido pelo fornecedor"
      />
    </fieldset>
  );
}

function PricePreview({ products, rule }: { products: RegionCatalogProduct[]; rule: PriceRule }) {
  const shown = products.slice(0, PREVIEW_ROWS);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Prévia</p>
      <ul className="divide-y divide-border rounded-xl border border-border text-sm">
        {shown.map((product) => {
          const price = priceForRule(product, rule);
          const margin = estimateProfit(price, product.costCents)?.marginPercent ?? 0;
          return (
            <li key={product.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{product.title}</span>
              <span className="tabular-nums">{formatCents(price)}</span>
              <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                {Math.round(margin)}% margem
              </span>
            </li>
          );
        })}
      </ul>
      {products.length > PREVIEW_ROWS ? (
        <p className="text-xs text-muted-foreground">
          e mais {products.length - PREVIEW_ROWS} com a mesma regra.
        </p>
      ) : null}
    </div>
  );
}

function NoStores() {
  return (
    <div className="space-y-3 text-sm">
      <p>Conecte uma loja antes de publicar.</p>
      <Button asChild size="sm">
        <Link to="/lojas">Conectar loja</Link>
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
    }) => publishProductsInBulk({ data: input }),
    onSuccess: async ({ published, skipped }) => {
      const skippedNote = skipped > 0 ? ` (${skipped} já estavam publicados)` : "";
      toast.success(
        `${published} ${published === 1 ? "produto enviado" : "produtos enviados"} para publicação${skippedNote}`,
      );
      onDone();
      await queryClient.invalidateQueries({ queryKey: ["setup-progress"] });
      await navigate({ to: "/publicacoes" });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function BulkPublishForm({
  products,
  stores,
  onDone,
}: {
  products: RegionCatalogProduct[];
  stores: PublishStore[];
  onDone: () => void;
}) {
  const [storeIds, setStoreIds] = useState<ReadonlySet<string>>(
    new Set(stores.map((store) => store.id)),
  );
  const { kind, setKind, percent, setPercent, percentValid, rule, isValid } = usePriceRuleDraft();
  const mutation = useBulkPublish(onDone);
  const canSubmit = storeIds.size > 0 && isValid && !mutation.isPending;
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
            priceRule: rule,
          });
        }
      }}
    >
      <StorePicker stores={stores} selected={storeIds} onChange={setStoreIds} />
      <PriceRulePicker
        kind={kind}
        onKindChange={setKind}
        percent={percent}
        onPercentChange={setPercent}
        percentValid={percentValid}
      />
      <PricePreview products={products} rule={rule} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {mutation.isPending
            ? "Publicando..."
            : `Publicar ${products.length} ${products.length === 1 ? "produto" : "produtos"}`}
        </Button>
      </DialogFooter>
    </form>
  );
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
  products: RegionCatalogProduct[];
  stores: PublishStore[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Publicar {products.length} {products.length === 1 ? "produto" : "produtos"}
          </DialogTitle>
          <DialogDescription>
            Título e descrição vêm do fornecedor; você pode editar cada anúncio depois.
          </DialogDescription>
        </DialogHeader>
        {stores.length === 0 ? (
          <NoStores />
        ) : (
          open && (
            <BulkPublishForm
              products={products}
              stores={stores}
              onDone={() => onOpenChange(false)}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
