import { getListingOverview, listListingOverview } from "@sellbridge/database/repositories";
import { LISTING_FILTER_STATUSES, listingSortSchema } from "@sellbridge/shared/schemas";
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
import { listingSchema, presentListing } from "./listings-read.presenter";

const listingsQuerySchema = pageQuerySchema.extend({
  status: z
    .enum(LISTING_FILTER_STATUSES)
    .optional()
    .describe("Só anúncios com ao menos uma loja neste status."),
  search: z.string().trim().min(1).max(100).optional().describe("Busca no título do anúncio."),
  sort: listingSortSchema
    .default("recent")
    .describe("`recent`: mais novos primeiro; `best_selling`: mais vendidos em 30 dias."),
});

export const listListings = defineApiEndpoint({
  method: "GET",
  path: "/listings",
  operationId: "listListings",
  tag: "Anúncios",
  summary: "Listar anúncios",
  description:
    "Anúncios da organização (um por produto), com a situação em cada loja e as vendas dos últimos 30 dias.",
  scope: "listings:read",
  params: noInput,
  query: listingsQuerySchema,
  body: noInput,
  response: pageEnvelope(listingSchema),
  handle: async ({ context, query }) => {
    const page = await listListingOverview(
      database,
      context.tenantId,
      { status: query.status, search: query.search, sort: query.sort },
      { page: query.page, pageSize: query.pageSize },
    );
    return { data: page.items.map(presentListing), pagination: toPaginationMeta(page) };
  },
});

export const getListing = defineApiEndpoint({
  method: "GET",
  path: "/listings/{listingId}",
  operationId: "getListing",
  tag: "Anúncios",
  summary: "Ver um anúncio",
  description: "Um anúncio da organização com a situação em cada loja.",
  scope: "listings:read",
  params: z.object({ listingId: z.uuid().describe("Id do anúncio.") }),
  query: noInput,
  body: noInput,
  response: dataEnvelope(listingSchema),
  handle: async ({ context, params }) => {
    const row = await getListingOverview(database, context.tenantId, params.listingId);
    return { data: presentListing(row) };
  },
});
