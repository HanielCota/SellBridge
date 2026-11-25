import { MAX_BULK_PUBLISH } from "@sellbridge/shared/schemas";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BulkPublishDialog } from "@/components/catalog/bulk-publish-dialog";
import { pluralize } from "@/components/catalog/bulk-publish-parts";
import { storesForProducts } from "@/components/catalog/bulk-store-picker";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  blockedReason,
  checkPlan,
  initiallyTicked,
  mercadoLivreStoreIds,
  withTicked,
} from "@/features/entry-links/entry-choice";
import type { EntryLinkPageData } from "@/features/entry-links/entry-link.functions";
import { saleChannelsOf, type SaleChannels } from "@/features/listings/profit";
import { ChosenProductCard } from "./chosen-product-card";
import { PlanCheckPanel } from "./plan-check-panel";

type ReadyChoice = Extract<EntryLinkPageData, { kind: "ready" }>;

const PublishIcon = ACTION_ICONS.publish.icon;

function UnavailableNotice({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }
  return (
    <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      {pluralize(count, "produto", "produtos")} da sua escolha não {count === 1 ? "está" : "estão"}{" "}
      mais à venda e {count === 1 ? "ficou" : "ficaram"} de fora.
    </p>
  );
}

function PrepareButton({
  listings,
  reason,
  onPrepare,
}: {
  listings: number;
  reason: string | null;
  onPrepare: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="min-h-11 w-full"
        disabled={reason !== null}
        aria-describedby={reason === null ? undefined : "prepare-blocked"}
        onClick={onPrepare}
      >
        <PublishIcon aria-hidden="true" />
        {listings > 0
          ? `Preparar ${pluralize(listings, "anúncio", "anúncios")}`
          : "Preparar anúncios"}
      </Button>
      {reason === null ? (
        <p className="text-center text-xs text-muted-foreground">
          Nada é publicado agora: você confere preço e lojas e só então clica em Publicar.
        </p>
      ) : (
        <p id="prepare-blocked" className="text-center text-sm text-muted-foreground">
          {reason}
        </p>
      )}
    </div>
  );
}

function ChoiceHeader({ choice }: { choice: ReadyChoice }) {
  return (
    <PageHeader
      title="Seus produtos escolhidos"
      description={`Você escolheu ${pluralize(choice.products.length, "produto", "produtos")} de ${choice.supplierName}. Desmarque o que não quiser anunciar.`}
      actions={
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/catalogo" search={{ supplier: choice.supplierId }}>
            Ver no catálogo
          </Link>
        </Button>
      }
    />
  );
}

function ChosenProductList({
  products,
  ticked,
  channels,
  onTickedChange,
}: {
  products: ReadyChoice["products"];
  ticked: ReadonlySet<string>;
  channels: SaleChannels;
  onTickedChange: (ticked: ReadonlySet<string>) => void;
}) {
  const batchFull = ticked.size >= MAX_BULK_PUBLISH;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {ticked.size} de {pluralize(products.length, "marcado", "marcados")}
        {products.length > MAX_BULK_PUBLISH
          ? ` · até ${MAX_BULK_PUBLISH} por vez; prepare o resto depois`
          : null}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {products.map((product) => (
          <ChosenProductCard
            key={product.id}
            product={product}
            channels={channels}
            ticked={ticked.has(product.id)}
            tickDisabled={batchFull && !ticked.has(product.id)}
            onTickedChange={(next) => onTickedChange(withTicked(ticked, product.id, next))}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * The chosen products, ticked, with the plan check and "Preparar anúncios": it opens the bulk
 * publish review with the Mercado Livre stores ticked and the supplier's suggested price. Nothing
 * is published until the person clicks "Publicar" there (decision of 25/11/2026, "Caminho A").
 */
export function PrepareListings({ choice }: { choice: ReadyChoice }) {
  const [ticked, setTicked] = useState(() =>
    initiallyTicked(choice.products.map((product) => product.id)),
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const tickedProducts = choice.products.filter((product) => ticked.has(product.id));
  const mercadoLivreIds = mercadoLivreStoreIds(choice.stores);
  const reviewStores = storesForProducts(tickedProducts, choice.stores).filter((store) =>
    mercadoLivreIds.has(store.id),
  );
  const check = checkPlan(choice.planRoom, tickedProducts.length, reviewStores.length);
  return (
    <>
      <ChoiceHeader choice={choice} />
      <UnavailableNotice count={choice.unavailableCount} />
      <PlanCheckPanel
        room={choice.planRoom}
        check={check}
        productCount={tickedProducts.length}
        storeCount={reviewStores.length}
      />
      <PrepareButton
        listings={check.listings}
        reason={blockedReason(tickedProducts.length, check)}
        onPrepare={() => setReviewOpen(true)}
      />
      <ChosenProductList
        products={choice.products}
        ticked={ticked}
        channels={saleChannelsOf(reviewStores)}
        onTickedChange={setTicked}
      />
      <BulkPublishDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        products={tickedProducts}
        stores={choice.stores}
        start={{ storeIds: mercadoLivreIds, priceKind: "suggested" }}
      />
    </>
  );
}
