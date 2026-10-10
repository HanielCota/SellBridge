import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { getSupplierCatalog } from "@/features/suppliers/suppliers.functions";
import { ProductStockLine } from "@/components/catalog/product-stock-line";
import { ProductVisual } from "@/components/catalog/product-visual";

export type SupplierCatalogProduct = Awaited<
  ReturnType<typeof getSupplierCatalog>
>["products"]["items"][number];

/** One product of a supplier's catalog: cost against suggested price, and a publish shortcut. */
export function SupplierProductCard({ product }: { readonly product: SupplierCatalogProduct }) {
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
            {product.categoryName ? `${product.categoryName} · ` : null}SKU {product.sku}
          </p>
          <h3 className="line-clamp-2 text-sm font-medium">{product.title}</h3>
        </div>
        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-xs text-muted-foreground">Custo</dt>
          <dt className="text-right text-xs text-muted-foreground">Preço sugerido</dt>
          <dd className="font-semibold tabular-nums">{formatCents(product.costCents)}</dd>
          <dd className="text-right tabular-nums">{formatCents(product.suggestedPriceCents)}</dd>
        </dl>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <ProductStockLine stock={product.stock} />
          {product.stock > 0 ? (
            <Button asChild size="sm" variant="secondary">
              <Link to="/publicacoes/nova" search={{ productId: product.id }}>
                Publicar
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
