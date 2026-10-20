import type { SellerProductListSearch } from "@sellbridge/shared/seller-catalog-schemas";
import { sellerProductListSearchSchema } from "@sellbridge/shared/seller-catalog-schemas";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { sellerListProductsFn } from "@/features/seller-products/products.functions";
import { productStatus } from "./editor-controls";

type Products = Awaited<ReturnType<typeof sellerListProductsFn>>["items"];

export function ProductsToolbar({
  search,
  onChange,
}: {
  search: SellerProductListSearch;
  onChange: (change: Partial<SellerProductListSearch>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor="seller-product-search">Search title or SKU</Label>
        <Input
          id="seller-product-search"
          value={search.query ?? ""}
          onChange={(event) => onChange({ query: event.target.value || undefined, page: 1 })}
        />
      </div>
      <div>
        <Label htmlFor="seller-product-status">Product status</Label>
        <select
          id="seller-product-status"
          className="h-11 rounded-xl border border-input bg-background px-3"
          value={search.status}
          onChange={(event) =>
            onChange({
              status: sellerProductListSearchSchema.shape.status.parse(event.target.value),
              page: 1,
            })
          }
        >
          {["all", "draft", "ready", "archived", "blocked"].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <Button asChild variant="outline">
        <Link to="/catalogo">Supplier catalog</Link>
      </Button>
    </div>
  );
}

export function ProductCards({
  products,
  onOpen,
}: {
  products: Products;
  onOpen: (id: string) => void;
}) {
  if (products.length === 0)
    return (
      <p className="surface-card rounded-3xl bg-card p-8">
        No products match this view. Add your first product or change the filters.
      </p>
    );
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((item) => (
        <li key={item.id} className="surface-card space-y-3 rounded-2xl bg-card p-5">
          {item.imageUrls[0] ? (
            <img
              src={item.imageUrls[0]}
              alt={item.title}
              className="h-36 w-full rounded-lg object-contain"
            />
          ) : null}
          <h2 className="font-semibold">{item.title || "Untitled draft"}</h2>
          <p>
            {item.sku} · {productStatus(item)}
          </p>
          <p>
            Stock: {item.stock} · Reserved: {item.reservedStock}
          </p>
          <Button variant="outline" onClick={() => onOpen(item.id)}>
            Edit product
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function ProductPager({
  total,
  page,
  pageSize,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <Button variant="outline" disabled={page === 1} onClick={() => onPage(page - 1)}>
        Previous page
      </Button>
      <span>
        {total} products · Page {page}
      </span>
      <Button
        variant="outline"
        disabled={page * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        Next page
      </Button>
    </div>
  );
}
