import { getSellableProducts, listSellableCatalog } from "@sellbridge/database/repositories";
import { notFoundError } from "@sellbridge/shared/errors";
import { productSortSchema, freeText } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { database } from "@/lib/server/database";
import {
  dataEnvelope,
  defineApiEndpoint,
  noInput,
  pageEnvelope,
  pageQuerySchema,
  toPaginationMeta,
} from "../endpoint";
import { catalogProductSchema, presentCatalogProduct } from "./catalog.presenter";
import { queryBooleanSchema } from "./query-params";

const catalogQuerySchema = pageQuerySchema.extend({
  // Same cleanup as every typed text: no control characters, and "É" in one form only.
  search: freeText()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("Busca no título, SKU e fornecedor."),
  category: freeText().trim().min(1).max(100).optional().describe("Slug da categoria."),
  supplierId: z.uuid().optional().describe("Só produtos deste fornecedor."),
  inStock: queryBooleanSchema.optional().describe("`true` para só produtos com estoque."),
  unpublished: queryBooleanSchema
    .optional()
    .describe("`true` para esconder produtos que a organização já anunciou."),
  sort: productSortSchema
    .default("title")
    .describe(
      "`title` (A–Z), `cost_asc`, `cost_desc`, `margin_desc` (maior margem sugerida), `stock_desc` ou `newest`.",
    ),
});

export const listCatalogProducts = defineApiEndpoint({
  method: "GET",
  path: "/catalog/products",
  operationId: "listCatalogProducts",
  tag: "Catálogo",
  summary: "Listar produtos do catálogo",
  description:
    "Produtos ativos de todos os fornecedores ativos do SellBridge, de qualquer lugar do Brasil.",
  scope: "catalog:read",
  params: noInput,
  query: catalogQuerySchema,
  body: noInput,
  response: pageEnvelope(catalogProductSchema),
  handle: async ({ context, query }) => {
    const page = await listSellableCatalog(
      database,
      context.tenantId,
      {
        search: query.search,
        categorySlug: query.category,
        supplierId: query.supplierId,
        inStockOnly: query.inStock,
        unpublishedOnly: query.unpublished,
        sort: query.sort,
      },
      { page: query.page, pageSize: query.pageSize },
    );
    return { data: page.items.map(presentCatalogProduct), pagination: toPaginationMeta(page) };
  },
});

export const getCatalogProduct = defineApiEndpoint({
  method: "GET",
  path: "/catalog/products/{productId}",
  operationId: "getCatalogProduct",
  tag: "Catálogo",
  summary: "Ver um produto do catálogo",
  description: "Um produto ativo de um fornecedor ativo; 404 se não existir ou estiver inativo.",
  scope: "catalog:read",
  params: z.object({ productId: z.uuid().describe("Id do produto.") }),
  query: noInput,
  body: noInput,
  response: dataEnvelope(catalogProductSchema),
  handle: async ({ context, params }) => {
    const [product] = await getSellableProducts(database, context.tenantId, [params.productId]);
    if (product === undefined) {
      throw notFoundError("Produto não encontrado no catálogo");
    }
    return { data: presentCatalogProduct(product) };
  },
});
