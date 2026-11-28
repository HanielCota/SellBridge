import {
  type AdminSupplierProduct,
  type DeveloperSupplier,
  listAdminSupplierProducts,
  listSuppliersForDeveloper,
} from "@sellbridge/database/repositories";
import { availableUnits } from "@sellbridge/shared/stock-reservation";
import { z } from "zod";
import {
  noInput,
  pageEnvelope,
  pageQuerySchema,
  toPaginationMeta,
} from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";

const supplierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  niche: z.string(),
  description: z.string(),
  state: z.string(),
  city: z.string(),
  logoUrl: z.string().nullable(),
  active: z.boolean(),
  approvalStatus: z.string().describe("Situação da aprovação do fornecedor pela equipe."),
  acceptWithinHours: z.number().int().describe("Prazo para aceitar um pedido, em horas."),
  dispatchWithinHours: z.number().int().describe("Prazo para despachar um pedido, em horas."),
  organizationId: z
    .string()
    .nullable()
    .describe("Conta do painel do fornecedor; nula quando a equipe cuida dele."),
  private: z
    .boolean()
    .describe(
      "Verdadeiro para o catálogo particular de um revendedor, que só ele usa e que não aparece para os outros.",
    ),
  ownerOrganizationId: z
    .string()
    .nullable()
    .describe("Revendedor dono do catálogo particular; nulo nos fornecedores abertos a todos."),
  createdAt: z.iso.datetime(),
});

const supplierProductSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  title: z.string(),
  imageUrls: z.array(z.string()).describe("Fotos do produto; a primeira é a principal."),
  color: z.string().nullable(),
  size: z.string().nullable(),
  costCents: z.number().int().describe("Quanto o revendedor paga ao fornecedor, em centavos."),
  suggestedPriceCents: z.number().int().nullable(),
  stock: z.number().int().describe("Unidades no estoque, incluindo as já reservadas."),
  reservedStock: z.number().int().describe("Unidades já separadas para pedidos em andamento."),
  availableStock: z.number().int().nonnegative().describe("Unidades disponíveis após as reservas."),
  active: z.boolean(),
  reviewStatus: z.string().describe("Situação da revisão do produto pela equipe."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Contact e-mail and fiscal profile stay out: they are the supplier's, not catalog data. */
function presentSupplier(supplier: DeveloperSupplier): z.input<typeof supplierSchema> {
  return {
    id: supplier.id,
    name: supplier.name,
    niche: supplier.niche,
    description: supplier.description,
    state: supplier.state,
    city: supplier.city,
    logoUrl: supplier.logoUrl,
    active: supplier.active,
    approvalStatus: supplier.approvalStatus,
    acceptWithinHours: supplier.acceptWithinHours,
    dispatchWithinHours: supplier.dispatchWithinHours,
    organizationId: supplier.organizationId,
    private: supplier.catalogKind === "seller",
    ownerOrganizationId: supplier.ownerTenantId,
    createdAt: supplier.createdAt.toISOString(),
  };
}

function presentSupplierProduct(
  product: AdminSupplierProduct,
): z.input<typeof supplierProductSchema> {
  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    imageUrls: product.imageUrls,
    color: product.color,
    size: product.size,
    costCents: product.costCents,
    suggestedPriceCents: product.suggestedPriceCents,
    stock: product.stock,
    reservedStock: product.reservedStock,
    availableStock: availableUnits(product.stock, product.reservedStock),
    active: product.active,
    reviewStatus: product.reviewStatus,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export const listDeveloperSuppliers = defineDeveloperEndpoint({
  path: "/suppliers",
  operationId: "listSuppliers",
  tag: "Fornecedores",
  summary: "Listar fornecedores",
  description:
    "Todos os fornecedores, em ordem alfabética, inclusive os catálogos particulares que um revendedor mantém só para ele (marcados com `private`).",
  scope: "suppliers:read",
  params: noInput,
  query: pageQuerySchema,
  response: pageEnvelope(supplierSchema),
  handle: async ({ query }) => {
    const page = await listSuppliersForDeveloper(database, query);
    return { data: page.items.map(presentSupplier), pagination: toPaginationMeta(page) };
  },
});

export const listDeveloperSupplierProducts = defineDeveloperEndpoint({
  path: "/suppliers/{supplierId}/products",
  operationId: "listSupplierProducts",
  tag: "Fornecedores",
  summary: "Listar produtos e estoque de um fornecedor",
  description:
    "Todos os produtos do fornecedor, ativos ou não, com fotos, custo e estoque. Vale também para os catálogos particulares.",
  scope: "suppliers:read",
  params: z.object({ supplierId: z.uuid().describe("Id do fornecedor (veja `GET /suppliers`).") }),
  query: pageQuerySchema,
  response: pageEnvelope(supplierProductSchema),
  handle: async ({ params, query }) => {
    const page = await listAdminSupplierProducts(database, params.supplierId, undefined, query);
    return { data: page.items.map(presentSupplierProduct), pagination: toPaginationMeta(page) };
  },
});
