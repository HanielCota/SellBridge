import { DEVELOPER_SCOPES } from "@sellbridge/shared/developer-api";
import { z } from "zod";
import { dataEnvelope, noInput } from "@/features/public-api/endpoint";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { DEVELOPER_REQUESTS_PER_MINUTE } from "../developer-rate-limit.server";

/** The first call from another project: checks the key and shows what it may read. */
export const getDeveloperMe = defineDeveloperEndpoint({
  path: "/me",
  operationId: "getDeveloperMe",
  tag: "Chave",
  summary: "Conferir a chave",
  description: "A primeira chamada de outro projeto: confere a chave e mostra o que ela pode ler.",
  scope: null,
  params: noInput,
  query: noInput,
  response: dataEnvelope(
    z.object({
      key: z.object({
        name: z.string(),
        prefix: z.string(),
        scopes: z.array(z.enum(DEVELOPER_SCOPES)),
        expiresAt: z.iso.datetime(),
      }),
      rateLimit: z.object({ requestsPerMinute: z.number().int() }),
    }),
  ),
  handle: async ({ caller }) => ({
    data: {
      key: {
        name: caller.name,
        prefix: caller.prefix,
        scopes: [...caller.scopes],
        expiresAt: caller.expiresAt.toISOString(),
      },
      rateLimit: { requestsPerMinute: DEVELOPER_REQUESTS_PER_MINUTE },
    },
  }),
});
