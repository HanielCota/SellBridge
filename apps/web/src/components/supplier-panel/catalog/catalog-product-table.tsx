import type {
  PanelListGrid,
  SupplierPanelListProduct,
  SupplierPanelProduct,
} from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { Money } from "@/components/data/money";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SmartDate } from "@/components/data/smart-date";
import { ProductVisual } from "@/components/catalog/product-visual";
import { Button } from "@/components/ui/button";
import { ProductDeleteButton } from "./product-delete-button";
import { ProductSaleToggle } from "./product-sale-toggle";
import { CompletenessBadge, MissingFiscalBadge, ProductStatus } from "./review-status";
import { SortableHeader, type CatalogSort } from "./sortable-header";
import { CONTROL_HINTS, TERM_HINTS } from "@/components/icons/action-icons";
import { Hint, HintedText } from "@/components/ui/hint";

export interface CatalogPage {
  items: SupplierPanelListProduct[];
  page: number;
  totalPages: number;
  total: number;
}

export type OpenProduct = (productId: string, focusField?: string) => void;
export type OpenGrid = (modelId: string) => void;

function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "2 cores · 5 tamanhos", leaving out an axis the grid does not have. */
function gridOptionsLine(grid: PanelListGrid): string {
  return [
    grid.colors > 0 ? countOf(grid.colors, "cor", "cores") : null,
    grid.sizes > 0 ? countOf(grid.sizes, "tamanho", "tamanhos") : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

/** Where "Corrigir" lands: the reviewer's first reason, else the first thing blocking. */
function fieldToFix(product: SupplierPanelProduct): string | undefined {
  const showsReasons = product.reviewStatus === "rejected" || product.reviewStatus === "draft";
  const reason = showsReasons ? product.rejectionReasons[0] : undefined;
  return reason?.field ?? product.completeness.blocking[0]?.field;
}

function ProductAction({
  product,
  onOpen,
}: {
  product: SupplierPanelProduct;
  onOpen: OpenProduct;
}) {
  const field = fieldToFix(product);
  if (field === undefined) {
    return (
      <Hint label={CONTROL_HINTS.editProduct} openOnTap={false}>
        <Button variant="outline" size="sm" onClick={() => onOpen(product.id)}>
          Editar
        </Button>
      </Hint>
    );
  }
  return (
    <Hint label={CONTROL_HINTS.fixProduct} openOnTap={false}>
      <Button size="sm" onClick={() => onOpen(product.id, field)}>
        Corrigir
      </Button>
    </Hint>
  );
}

function ProductActions({
  product,
  onOpen,
}: {
  product: SupplierPanelListProduct;
  onOpen: OpenProduct;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ProductAction product={product} onOpen={onOpen} />
      {/* A grid goes on and off sale combination by combination, inside its form. */}
      {product.grid === null ? <ProductSaleToggle product={product} /> : null}
      <ProductDeleteButton product={product} />
    </div>
  );
}

function StatusHeader() {
  return (
    <span>
      Situação e{" "}
      <HintedText label={TERM_HINTS.completeness} className="hinted-term">
        completude
      </HintedText>
    </span>
  );
}

/** Approved and active: the product sells whatever data it still misses. */
function isOnSale(product: SupplierPanelProduct): boolean {
  return product.reviewStatus === "approved" && product.active;
}

/** The review status above the completeness, as the phone card shows them, in one column. */
function StatusCell({ product }: { product: SupplierPanelListProduct }) {
  return (
    <div className="flex flex-col items-start gap-1.5 whitespace-normal">
      <ProductStatus product={product} />
      <div className="flex flex-wrap items-center gap-1.5">
        <CompletenessBadge
          score={product.completeness.score}
          blocking={product.completeness.blocking.length}
          onSale={isOnSale(product)}
        />
        <MissingFiscalBadge completeness={product.completeness} />
      </div>
    </div>
  );
}

/** The reviewer's reason, on the row itself: a rejection is never silent. */
function RejectionLine({ product }: { product: SupplierPanelProduct }) {
  const reason = product.reviewStatus === "rejected" ? product.rejectionReasons[0] : undefined;
  if (reason === undefined) {
    return null;
  }
  const more = product.rejectionReasons.length - 1;
  return (
    <p className="flex items-start gap-1 text-footnote text-destructive">
      <WarningCircleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {reason.message}
        {more > 0 ? (
          <span className="ml-1 font-medium">
            +{more} {more === 1 ? "motivo" : "motivos"}
          </span>
        ) : null}
      </span>
    </p>
  );
}

/** The name opens the product too, on the field to fix: the obvious place to click. */
function ProductCell({
  product,
  onOpen,
}: {
  product: SupplierPanelListProduct;
  onOpen: OpenProduct;
}) {
  return (
    <div className="flex max-w-[23rem] min-w-[12rem] items-start gap-3 whitespace-normal">
      <ProductThumbnail product={product} />
      <ProductCellText product={product} onOpen={onOpen} />
    </div>
  );
}

/** The cover photo, or the category's icon on a neutral tile while there is none. */
function ProductThumbnail({ product }: { product: SupplierPanelProduct }) {
  return (
    <ProductVisual
      imageUrl={product.imageUrls[0] ?? null}
      title={product.title}
      categoryName={product.categoryName}
      compact
      className="size-9 shrink-0 rounded-lg"
    />
  );
}

function productName(product: SupplierPanelListProduct): string {
  const title = product.grid?.title ?? product.title;
  return title.trim() === "" ? "Sem título" : title;
}

function ProductCellText({
  product,
  onOpen,
}: {
  product: SupplierPanelListProduct;
  onOpen: OpenProduct;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <button
        type="button"
        onClick={() => onOpen(product.id, fieldToFix(product))}
        className="line-clamp-2 cursor-pointer rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {productName(product)}
      </button>
      <p className="text-footnote text-muted-foreground">
        {product.grid === null
          ? (product.categoryName ?? "Sem categoria")
          : `${gridOptionsLine(product.grid)} · ${product.categoryName ?? "Sem categoria"}`}
      </p>
      <RejectionLine product={product} />
    </div>
  );
}

/** A grid has one code per combination, so its row says how many. */
function CodeCell({ product }: { product: SupplierPanelListProduct }) {
  if (product.grid !== null) {
    return (
      <span className="text-footnote text-muted-foreground">
        {countOf(product.grid.combinations, "combinação", "combinações")}
      </span>
    );
  }
  return (
    <span className="block max-w-[9rem] font-mono text-footnote break-all whitespace-normal">
      {product.sku}
    </span>
  );
}

/** Each combination of a grid has its own cost, shown inside the grid. */
function CostCell({ product }: { product: SupplierPanelListProduct }) {
  if (product.grid !== null) {
    return <span className="text-footnote text-muted-foreground">Cada combinação</span>;
  }
  return <Money cents={product.costCents} />;
}

const columnHelper = createServerColumnHelper<SupplierPanelListProduct>();

function catalogColumns(
  sort: CatalogSort,
  onSort: (sort: CatalogSort) => void,
  onOpen: OpenProduct,
) {
  const header =
    (column: CatalogSort["sort"], label: string, align: "start" | "end" = "start") =>
    () => (
      <SortableHeader column={column} label={label} current={sort} onSort={onSort} align={align} />
    );
  return columnHelper.columns([
    columnHelper.accessor("title", {
      header: header("title", "Produto"),
      cell: (information) => <ProductCell product={information.row.original} onOpen={onOpen} />,
    }),
    columnHelper.accessor("sku", {
      header: header("sku", "Código"),
      cell: (information) => <CodeCell product={information.row.original} />,
    }),
    columnHelper.display({
      id: "status",
      header: () => <StatusHeader />,
      cell: (information) => <StatusCell product={information.row.original} />,
    }),
    columnHelper.accessor("costCents", {
      header: header("costCents", "Custo"),
      cell: (information) => <CostCell product={information.row.original} />,
    }),
    columnHelper.accessor("stock", {
      header: header("stock", "Estoque"),
      cell: (information) => (
        <span className="tabular-nums">
          {information.row.original.grid?.stock ?? information.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("updatedAt", {
      header: header("updatedAt", "Atualizado"),
      cell: (information) => <SmartDate date={information.getValue()} />,
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Ações</span>,
      cell: (information) => <ProductActions product={information.row.original} onOpen={onOpen} />,
    }),
  ]);
}

function MobileProductRow({
  product,
  onOpen,
}: {
  product: SupplierPanelListProduct;
  onOpen: OpenProduct;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <ProductThumbnail product={product} />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{productName(product)}</p>
          {product.grid === null ? (
            <p className="text-footnote text-muted-foreground">
              <span className="font-mono">{product.sku}</span>, {formatCents(product.costCents)},{" "}
              {product.stock} un.
            </p>
          ) : (
            <p className="text-footnote text-muted-foreground">
              {gridOptionsLine(product.grid)} ·{" "}
              {countOf(product.grid.combinations, "combinação", "combinações")} ·{" "}
              {product.grid.stock} un.
            </p>
          )}
          <RejectionLine product={product} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ProductStatus product={product} />
        <CompletenessBadge
          score={product.completeness.score}
          blocking={product.completeness.blocking.length}
          onSale={isOnSale(product)}
        />
        <MissingFiscalBadge completeness={product.completeness} />
      </div>
      <ProductActions product={product} onOpen={onOpen} />
    </div>
  );
}

export function CatalogProductTable({
  data,
  sort,
  onSort,
  onOpen,
  onOpenGrid,
  onPageChange,
}: {
  data: CatalogPage;
  sort: CatalogSort;
  onSort: (sort: CatalogSort) => void;
  onOpen: OpenProduct;
  onOpenGrid: OpenGrid;
  onPageChange: (page: number) => void;
}) {
  // A grid's row opens the grid form; any other row opens the product.
  const open: OpenProduct = (productId, focusField) => {
    const grid = data.items.find((item) => item.id === productId)?.grid ?? null;
    if (grid === null) {
      onOpen(productId, focusField);
      return;
    }
    onOpenGrid(grid.modelId);
  };
  return (
    <DataTable
      columns={catalogColumns(sort, onSort, open)}
      data={data.items}
      caption="Produtos"
      getRowId={(row) => row.id}
      pinLastColumn
      dense
      renderMobileRow={(row) => <MobileProductRow product={row} onOpen={open} />}
      footer={
        <PaginationBar
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          itemLabel={{ one: "produto", other: "produtos" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}
