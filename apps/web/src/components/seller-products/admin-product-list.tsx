import type { z } from "zod";
import { Link } from "@tanstack/react-router";
import {
  adminProductListSearchSchema,
  type adminListCatalogProductsFn,
} from "@/features/seller-products/products.functions";
import { ProductVisual } from "@/components/catalog/product-visual";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { productStatus } from "./editor-controls";

type AdminSearch = z.infer<typeof adminProductListSearchSchema>;
type AdminProducts = Awaited<ReturnType<typeof adminListCatalogProductsFn>>["items"];

const ORIGIN_OPTIONS = [
  { value: "all", label: "Todas as origens" },
  { value: "seller", label: "Produto próprio do revendedor" },
  { value: "supplier", label: "Catálogo de fornecedores" },
] as const;

export function AdminProductsToolbar({
  search,
  onChange,
}: {
  search: AdminSearch;
  onChange: (change: Partial<AdminSearch>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      {/* On a phone each field takes its own row: side by side the search shrank to a sliver. */}
      <div className="grid min-w-0 basis-full gap-2 sm:basis-auto sm:flex-1">
        <Label htmlFor="admin-product-search">Buscar produto, código, cliente ou fornecedor</Label>
        <Input
          id="admin-product-search"
          value={search.query ?? ""}
          onChange={(event) => onChange({ query: event.target.value || undefined, page: 1 })}
        />
      </div>
      <div className="w-full sm:w-64">
        <SelectField
          id="admin-product-origin"
          label="Origem do produto"
          value={search.origin}
          error={null}
          options={ORIGIN_OPTIONS}
          onValueChange={(origin) =>
            onChange({
              origin: adminProductListSearchSchema.shape.origin.parse(origin),
              page: 1,
            })
          }
        />
      </div>
      {search.tenantId ? (
        <Button variant="outline" onClick={() => onChange({ tenantId: undefined, page: 1 })}>
          Limpar filtro de cliente
        </Button>
      ) : null}
    </div>
  );
}

export function AdminProductCards({
  products,
  onOpen,
}: {
  products: AdminProducts;
  onOpen: (tenantId: string, productId: string) => void;
}) {
  if (products.length === 0) return <p>Nenhum produto com estes filtros.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((row) => (
        <li key={row.product.id} className="surface-card space-y-3 rounded-2xl bg-card p-5">
          <div className="flex items-start gap-3">
            <ProductVisual
              imageUrl={row.product.imageUrls[0] ?? null}
              title={row.product.title}
              categoryName={null}
              compact
              className="size-14 shrink-0 rounded-xl"
            />
            <div className="min-w-0 space-y-1">
              <h2 className="font-semibold">{row.product.title || "Rascunho sem título"}</h2>
              <p>
                {row.ownerName ?? row.sourceName} ·{" "}
                {row.origin === "seller"
                  ? "Produto próprio do revendedor"
                  : "Catálogo de fornecedores"}
              </p>
              <p>
                {row.product.sku} · {productStatus(row.product, row.origin)}
              </p>
            </div>
          </div>
          {row.tenantId === null ? (
            <Button asChild variant="outline">
              <Link to="/admin/fornecedores/$supplierId" params={{ supplierId: row.sourceId }}>
                Gerenciar catálogo do fornecedor
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                if (row.tenantId !== null) onOpen(row.tenantId, row.product.id);
              }}
            >
              Gerenciar produto do cliente
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
