import type { z } from "zod";
import { Link } from "@tanstack/react-router";
import {
  adminProductListSearchSchema,
  type adminListCatalogProductsFn,
} from "@/features/seller-products/products.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { productStatus } from "./editor-controls";

type AdminSearch = z.infer<typeof adminProductListSearchSchema>;
type AdminProducts = Awaited<ReturnType<typeof adminListCatalogProductsFn>>["items"];

export function AdminProductsToolbar({
  search,
  onChange,
}: {
  search: AdminSearch;
  onChange: (change: Partial<AdminSearch>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <Label htmlFor="admin-product-search">Buscar produto, código, cliente ou fornecedor</Label>
        <Input
          id="admin-product-search"
          value={search.query ?? ""}
          onChange={(event) => onChange({ query: event.target.value || undefined, page: 1 })}
        />
      </div>
      <div>
        <Label htmlFor="admin-product-origin">Origem do produto</Label>
        <select
          id="admin-product-origin"
          className="h-11 rounded-xl border border-input bg-background px-3"
          value={search.origin}
          onChange={(event) =>
            onChange({
              origin: adminProductListSearchSchema.shape.origin.parse(event.target.value),
              page: 1,
            })
          }
        >
          <option value="all">Todas as origens</option>
          <option value="seller">Produto próprio do revendedor</option>
          <option value="supplier">Catálogo de fornecedores</option>
        </select>
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
  if (products.length === 0) return <p>Nenhum produto encontrado com estes filtros.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((row) => (
        <li key={row.product.id} className="surface-card space-y-3 rounded-2xl bg-card p-5">
          <h2 className="font-semibold">{row.product.title || "Rascunho sem título"}</h2>
          <p>
            {row.ownerName ?? row.sourceName} ·{" "}
            {row.origin === "seller" ? "Produto próprio do revendedor" : "Catálogo de fornecedores"}
          </p>
          <p>
            {row.product.sku} · {productStatus(row.product, row.origin)}
          </p>
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
