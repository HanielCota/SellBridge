import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import type { getSupplierCatalog } from "@/features/suppliers/suppliers.functions";
import { ProductStockLine } from "@/components/catalog/product-stock-line";
import { ProductVisual } from "@/components/catalog/product-visual";
import { PUBLISH_NEEDS_STORE_HINT } from "@/features/suppliers/supplier-publish-access";

const PublishIcon = ACTION_ICONS.publish.icon;

export type SupplierCatalogProduct = Awaited<
  ReturnType<typeof getSupplierCatalog>
>["products"]["items"][number];

/**
 * Cost and suggested price, each whole on one line: on a phone's narrow card "R$ 119,90" broke
 * in two. When both do not fit side by side, the suggested price wraps below the cost.
 */
function ProductPrices({
  costCents,
  suggestedPriceCents,
}: {
  costCents: number;
  suggestedPriceCents: number;
}) {
  return (
    <dl className="mt-auto flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
      <div className="space-y-0.5">
        <dt className="text-xs text-muted-foreground">Custo</dt>
        <dd className="font-semibold whitespace-nowrap tabular-nums">{formatCents(costCents)}</dd>
      </div>
      <div className="ml-auto space-y-0.5 text-right">
        <dt className="text-xs text-muted-foreground">Preço sugerido</dt>
        <dd className="whitespace-nowrap tabular-nums">{formatCents(suggestedPriceCents)}</dd>
      </div>
    </dl>
  );
}

/** One product of a supplier's catalog: cost against suggested price, and a publish shortcut. */
export function SupplierProductCard({
  product,
  canPublish,
}: {
  readonly product: SupplierCatalogProduct;
  /** No store of the account sells this supplier yet: the button stays, disabled. */
  readonly canPublish: boolean;
}) {
  return (
    <article className="surface-card flex h-full flex-col overflow-hidden rounded-3xl bg-card">
      <ProductVisual
        imageUrl={product.imageUrl}
        title={product.title}
        categoryName={product.categoryName}
        className="aspect-[16/10]"
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <p className="truncate text-xs text-muted-foreground">
            {product.categoryName ? `${product.categoryName} · ` : null}código {product.sku}
          </p>
          <h3 className="line-clamp-2 text-sm font-medium">{product.title}</h3>
        </div>
        <ProductPrices
          costCents={product.costCents}
          suggestedPriceCents={product.suggestedPriceCents}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          {/* As tall as the publish button, so sold-out cards keep the price row level. */}
          <span className="flex min-h-8 items-center">
            <ProductStockLine stock={product.stock} updatedAt={product.stockUpdatedAt} />
          </span>
          {product.stock > 0 && !canPublish ? (
            <Button size="sm" variant="secondary" disabled title={PUBLISH_NEEDS_STORE_HINT}>
              <PublishIcon weight="bold" aria-hidden="true" />
              Publicar
            </Button>
          ) : null}
          {product.stock > 0 && canPublish ? (
            <Hint label={ACTION_ICONS.publish.hint} openOnTap={false}>
              <Button asChild size="sm" variant="secondary">
                <Link to="/publicacoes/nova" search={{ productId: product.id }}>
                  <PublishIcon weight="bold" aria-hidden="true" />
                  Publicar
                </Link>
              </Button>
            </Hint>
          ) : null}
        </div>
      </div>
    </article>
  );
}
