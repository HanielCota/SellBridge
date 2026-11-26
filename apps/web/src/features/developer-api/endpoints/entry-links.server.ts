import {
  createDeveloperEntryLink,
  findOfferedSupplierProductIds,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { z } from "zod";
import { dataEnvelope } from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { defineDeveloperBodyEndpoint } from "../developer-endpoint.server";
import {
  ENTRY_LINK_LIFETIME_MINUTES,
  entryLinkExpiration,
  entryLinkUrl,
  generateEntryLinkToken,
} from "../entry-link-token.server";

/** A reseller picks a handful of products at a time; more is a bulk import, not a link. */
export const MAX_ENTRY_LINK_PRODUCTS = 100;

const entryLinkBodySchema = z.object({
  supplierId: z.uuid().describe("Fornecedor escolhido (veja `GET /suppliers`)."),
  productIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_ENTRY_LINK_PRODUCTS)
    .transform((ids) => [...new Set(ids)])
    .describe(
      `Produtos escolhidos desse fornecedor, de 1 a ${MAX_ENTRY_LINK_PRODUCTS} (veja \`GET /suppliers/{supplierId}/products\`).`,
    ),
});

const entryLinkSchema = z.object({
  url: z.url().describe("Abra para a pessoa; a seleção só pode ser confirmada uma vez."),
  expiresAt: z.iso.datetime(),
});

/**
 * Creates the link that takes a person from another project into SellBridge with a supplier and
 * products chosen. It changes no organization's data: the person signs in or signs up and goes
 * on from there.
 */
export const createDeveloperEntryLinkEndpoint = defineDeveloperBodyEndpoint({
  path: "/entry-links",
  operationId: "createEntryLink",
  tag: "Links de entrada",
  summary: "Criar um link de entrada",
  description: `Gera o link que leva a pessoa ao SellBridge com o fornecedor e os produtos já escolhidos. A pessoa tem ${ENTRY_LINK_LIFETIME_MINUTES} minutos para confirmar a seleção, uma única vez. Quem não tem conta se cadastra; quem tem entra. O link não leva nenhum dado da pessoa e só aceita produtos disponíveis para os revendedores.`,
  scope: "links:create",
  body: entryLinkBodySchema,
  response: dataEnvelope(entryLinkSchema),
  handle: async ({ caller, body, now }) => {
    const offered = new Set(
      await findOfferedSupplierProductIds(database, body.supplierId, body.productIds),
    );
    const refused = body.productIds.flatMap((productId) =>
      offered.has(productId) ? [] : [productId],
    );
    if (refused.length > 0) {
      throw validationError(
        "Alguns produtos não estão disponíveis no catálogo desse fornecedor. Revise a seleção e tente de novo.",
        refused,
      );
    }
    const { token, tokenHash } = generateEntryLinkToken();
    const expiresAt = entryLinkExpiration(now);
    await createDeveloperEntryLink(database, {
      tokenHash,
      keyId: caller.developerApiKeyId,
      supplierId: body.supplierId,
      productIds: body.productIds,
      expiresAt,
    });
    return {
      data: { url: entryLinkUrl(environment.APP_URL, token), expiresAt: expiresAt.toISOString() },
    };
  },
});
