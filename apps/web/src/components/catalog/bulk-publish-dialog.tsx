import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import type { PriceRule } from "@sellbridge/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import { publishProductsInBulk } from "@/features/catalog/catalog.functions";
import { usePriceOverrides, usePriceRuleDraft } from "@/features/catalog/use-price-rule-draft";
import { errorMessage } from "@/lib/errors";
import { PriceRulePicker } from "./bulk-price-rule-picker";
import { BulkPublishResult, type PublishedBatch } from "./bulk-publish-result";
import { pluralize } from "./bulk-publish-parts";
import { NoStores } from "./bulk-publish-stores";
import { type PublishStore, StorePicker, storesForProducts } from "./bulk-store-picker";

export type { PublishStore } from "./bulk-store-picker";

function useBulkPublish(onPublished: (batch: PublishedBatch) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      productIds: string[];
      storeConnectionIds: string[];
      priceRule: PriceRule;
      priceOverrides: Record<string, PriceRule>;
    }) => publishProductsInBulk({ data: input }),
    // The dialog stays open on the batch's progress and honest result (item 14.c).
    onSuccess: async ({ skipped, targetIds }) => {
      onPublished({ targetIds, skipped });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["setup-progress"] }),
        queryClient.invalidateQueries({ queryKey: ["sellable-catalog"] }),
        // The page it opens next lists them: a cached list from 30 s ago would not.
        queryClient.invalidateQueries({ queryKey: ["listings"] }),
      ]);
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
  onPublished,
}: {
  products: SellableCatalogProduct[];
  stores: PublishStore[];
  onPublished: (batch: PublishedBatch) => void;
}) {
  const [storeIds, setStoreIds] = useState<ReadonlySet<string>>(
    new Set(stores.map((store) => store.id)),
  );
  const draft = usePriceRuleDraft();
  const overrides = usePriceOverrides();
  const mutation = useBulkPublish(onPublished);
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

/**
 * Publishes the selected catalog products to the chosen stores with one price rule, then stays
 * on the batch's progress and result. Closing after a batch went out calls `onBatchDone` (the
 * catalog clears its selection) and the next opening starts on the form again.
 */
export function BulkPublishDialog({
  open,
  onOpenChange,
  onBatchDone,
  products,
  stores,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBatchDone?: () => void;
  products: SellableCatalogProduct[];
  stores: PublishStore[];
}) {
  const [batch, setBatch] = useState<PublishedBatch | null>(null);
  const eligible = storesForProducts(products, stores);
  const changeOpen = (next: boolean) => {
    if (!next && batch !== null) {
      setBatch(null);
      onBatchDone?.();
    }
    onOpenChange(next);
  };
  const body =
    batch === null ? (
      <BulkPublishForm products={products} stores={eligible} onPublished={setBatch} />
    ) : (
      <BulkPublishResult batch={batch} onClose={() => changeOpen(false)} />
    );
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto rounded-[1.75rem] p-5 sm:max-w-md">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Publicar {pluralize(products.length, "produto", "produtos")}
          </DialogTitle>
          <DialogDescription className="truncate">{selectionSummary(products)}</DialogDescription>
        </DialogHeader>
        {/* A batch already out keeps its result even if the stores list changes meanwhile. */}
        {eligible.length === 0 && batch === null ? (
          <NoStores products={products} hasStores={stores.length > 0} />
        ) : (
          open && body
        )}
      </DialogContent>
    </Dialog>
  );
}
