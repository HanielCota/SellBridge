import type { ListingOverviewRow, ListingStoreStatus } from "@sellbridge/database/repositories";
import { listingStatusSchema, marketplaceSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";

type ListingStatus = z.infer<typeof listingStatusSchema>;

const listingTargetSchema = z.object({
  storeId: z.uuid().describe("Loja de destino (veja `GET /stores`)."),
  storeName: z.string(),
  marketplace: marketplaceSchema,
  status: listingStatusSchema.describe(
    "`pending`: na fila; `publishing`: enviando; `published`: no ar; `paused`: pausado (estoque zero no marketplace); `error`: o marketplace recusou.",
  ),
  externalUrl: z.string().nullable().describe("Link do anúncio no marketplace, quando no ar."),
  errorReason: z.string().nullable().describe("Motivo da recusa, quando `status` é `error`."),
  publishedAt: z.iso.datetime().nullable(),
});

const targetCountsSchema = z
  .object({
    pending: z.number().int(),
    publishing: z.number().int(),
    published: z.number().int(),
    paused: z.number().int(),
    error: z.number().int(),
  })
  .describe("Quantas lojas estão em cada status.");

export const listingSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  priceCents: z.number().int().describe("Preço de venda, em centavos."),
  costCents: z.number().int().describe("Custo atual do produto no fornecedor, em centavos."),
  productId: z.uuid().describe("Produto do catálogo anunciado."),
  sku: z.string(),
  stock: z.number().int().describe("Estoque atual no fornecedor."),
  status: listingStatusSchema.describe(
    "Resumo de todas as lojas, pelo que mais pede atenção: `error`, depois `publishing`, `pending`, `paused` e por fim `published`.",
  ),
  targetCounts: targetCountsSchema,
  targets: z.array(listingTargetSchema).describe("Situação do anúncio em cada loja."),
  unitsSoldLast30Days: z
    .number()
    .int()
    .describe("Unidades vendidas nos últimos 30 dias, sem pedidos cancelados ou devolvidos."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ListingDto = z.input<typeof listingSchema>;

/** Most urgent first: what the seller has to act on comes before what is fine. */
const STATUS_PRIORITY: readonly ListingStatus[] = [
  "error",
  "publishing",
  "pending",
  "paused",
  "published",
];

/** One status for the whole listing; a listing with no store yet is still `pending`. */
export function summarizeListingStatus(statuses: readonly ListingStatus[]): ListingStatus {
  return STATUS_PRIORITY.find((status) => statuses.includes(status)) ?? "pending";
}

export function countTargetStatuses(
  statuses: readonly ListingStatus[],
): Record<ListingStatus, number> {
  return {
    pending: statuses.filter((status) => status === "pending").length,
    publishing: statuses.filter((status) => status === "publishing").length,
    published: statuses.filter((status) => status === "published").length,
    paused: statuses.filter((status) => status === "paused").length,
    error: statuses.filter((status) => status === "error").length,
  };
}

function presentTarget(store: ListingStoreStatus): ListingDto["targets"][number] | null {
  if (store.marketplace === "mock") return null;
  return {
    storeId: store.storeConnectionId,
    storeName: store.storeName,
    marketplace: store.marketplace,
    status: store.status,
    externalUrl: store.externalUrl,
    errorReason: store.status === "error" ? store.errorReason : null,
    publishedAt: store.publishedAt?.toISOString() ?? null,
  };
}

/** The overview dates a listing by its stores' last change; with no store, by its creation. */
function lastUpdate(row: ListingOverviewRow): Date {
  return Number.isNaN(row.updatedAt.getTime()) ? row.createdAt : row.updatedAt;
}

export function presentListing(row: ListingOverviewRow): ListingDto {
  const targets = row.stores.flatMap((store) => {
    const target = presentTarget(store);
    return target === null ? [] : [target];
  });
  const statuses = targets.map((target) => target.status);
  return {
    id: row.listingId,
    title: row.title,
    priceCents: row.priceCents,
    costCents: row.costCents,
    productId: row.productId,
    sku: row.sku,
    stock: row.stock,
    status: summarizeListingStatus(statuses),
    targetCounts: countTargetStatuses(statuses),
    targets,
    unitsSoldLast30Days: row.unitsSold,
    createdAt: row.createdAt.toISOString(),
    updatedAt: lastUpdate(row).toISOString(),
  };
}
