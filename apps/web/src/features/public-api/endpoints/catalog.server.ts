import {
  findTenantRegion,
  getRegionProducts,
  listRegionCatalog,
  type TenantRegion,
} from "@sellbridge/database/repositories";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
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

/**
 * The catalog depends on where the organization is. The app answers a missing region with
 * "forbidden", but for an API caller the key is fine: the account is just not set up yet.
 */
async function requireRegionForApi(tenantId: string): Promise<TenantRegion> {
  const region = await findTenantRegion(database, tenantId);
  if (!region) {
    throw conflictError(
      "A organização ainda não informou o CEP. Conclua o cadastro no SellBridge para ver o catálogo da sua região.",
    );
  }
  return region;
}

const catalogQuerySchema = pageQuerySchema.extend({
  search: z
    .string()
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
    "Produtos dos fornecedores que entregam na região da organização. Responde 409 se a organização ainda não informou o CEP no SellBridge.",
  scope: "catalog:read",
  params: noInput,
  query: catalogQuerySchema,
  body: noInput,
  response: pageEnvelope(catalogProductSchema),
  handle: async ({ context, query }) => {
    const region = await requireRegionForApi(context.tenantId);
    const page = await listRegionCatalog(
      database,
      { region, tenantId: context.tenantId },
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
  description: "Um produto disponível na região da organização; 404 se não for vendido nela.",
  scope: "catalog:read",
  params: z.object({ productId: z.uuid().describe("Id do produto.") }),
  query: noInput,
  body: noInput,
  response: dataEnvelope(catalogProductSchema),
  handle: async ({ context, params }) => {
    const region = await requireRegionForApi(context.tenantId);
    const [product] = await getRegionProducts(database, { region, tenantId: context.tenantId }, [
      params.productId,
    ]);
    if (!product) {
      throw notFoundError("Produto não encontrado na sua região");
    }
    return { data: presentCatalogProduct(product) };
  },
});
