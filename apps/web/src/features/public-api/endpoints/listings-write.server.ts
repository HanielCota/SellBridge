import { getListingOverview } from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
import {
  createListingForTenant,
  setListingsPausedForTenant,
  updateListingPriceForTenant,
} from "@/features/listings/listing-commands.server";
import { dataEnvelope, defineApiEndpoint, noInput } from "../endpoint";
import { listingSchema, presentListing } from "./listings-read.presenter";
import {
  assertHasChanges,
  createListingBodySchema,
  listingIdParamsSchema,
  updateListingBodySchema,
} from "./listings-write.schemas";

const TAG = "Anúncios";

/** Same rules as the app: the listing goes through the shared command, then to the queue. */
export const createListing = defineApiEndpoint({
  method: "POST",
  path: "/listings",
  operationId: "createListing",
  tag: TAG,
  summary: "Criar anúncio",
  description:
    "Cria um anúncio de um produto do catálogo e coloca a publicação de cada loja na fila. " +
    "A publicação é assíncrona: a resposta 202 traz o anúncio (mesmo formato de `GET /listings/{listingId}`) " +
    "com cada loja ainda na fila; acompanhe pelo anúncio ou pelos eventos `listing.published` e `listing.failed`. " +
    "Exige `Idempotency-Key`.",
  scope: "listings:write",
  params: noInput,
  query: noInput,
  body: createListingBodySchema,
  response: dataEnvelope(listingSchema),
  successStatus: 202,
  handle: async ({ context, body }) => {
    const created = await createListingForTenant(context.tenantId, {
      productId: body.productId,
      title: body.title,
      description: body.description,
      priceCents: body.priceCents,
      storeConnectionIds: body.storeIds,
    });
    const listing = await getListingOverview(database, context.tenantId, created.listingId);
    return { data: presentListing(listing) };
  },
});

export const updateListing = defineApiEndpoint({
  method: "PATCH",
  path: "/listings/{listingId}",
  operationId: "updateListing",
  tag: TAG,
  summary: "Alterar preço ou pausar anúncio",
  description:
    "Altera o preço de venda (precisa ser maior que o custo) e/ou pausa ou retoma o anúncio " +
    "em todas as lojas. Informe ao menos um dos campos. As lojas recebem a mudança na próxima " +
    "sincronização. Responde com o anúncio atualizado.",
  scope: "listings:write",
  params: listingIdParamsSchema,
  query: noInput,
  body: updateListingBodySchema,
  response: dataEnvelope(listingSchema),
  handle: async ({ context, params, body }) => {
    assertHasChanges(body);
    if (body.priceCents !== undefined) {
      await updateListingPriceForTenant(context.tenantId, params.listingId, body.priceCents);
    }
    if (body.paused !== undefined) {
      await setListingsPausedForTenant(context.tenantId, [params.listingId], body.paused);
    }
    const listing = await getListingOverview(database, context.tenantId, params.listingId);
    return { data: presentListing(listing) };
  },
});
