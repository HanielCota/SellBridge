import type { RegionCatalogProduct } from "@sellbridge/database/repositories";
import { z } from "zod";

export const catalogProductSchema = z.object({
  id: z.uuid().describe("Id do produto; use como `productId` ao criar um anúncio."),
  sku: z.string().describe("Código do produto no fornecedor."),
  title: z.string(),
  description: z.string(),
  supplier: z.object({ id: z.uuid(), name: z.string() }),
  category: z
    .object({ slug: z.string(), name: z.string() })
    .nullable()
    .describe("Categoria do produto; `slug` serve de filtro em `category`."),
  costCents: z.number().int().describe("Custo do produto no fornecedor, em centavos."),
  suggestedPriceCents: z.number().int().describe("Preço de venda sugerido, em centavos."),
  stock: z.number().int().describe("Estoque atual no fornecedor."),
  imageUrls: z.array(z.string()).describe("Fotos do produto; a primeira é a principal."),
  alreadyPublished: z.boolean().describe("A organização já tem um anúncio deste produto."),
});

export type CatalogProductDto = z.input<typeof catalogProductSchema>;

function presentCategory(product: RegionCatalogProduct): CatalogProductDto["category"] {
  if (product.categorySlug === null || product.categoryName === null) {
    return null;
  }
  return { slug: product.categorySlug, name: product.categoryName };
}

export function presentCatalogProduct(product: RegionCatalogProduct): CatalogProductDto {
  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    description: product.description,
    supplier: { id: product.supplierId, name: product.supplierName },
    category: presentCategory(product),
    costCents: product.costCents,
    suggestedPriceCents: product.suggestedPriceCents,
    stock: product.stock,
    imageUrls: product.imageUrls,
    alreadyPublished: product.published,
  };
}
