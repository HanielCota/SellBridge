import { getApiKeyIdentity } from "@sellbridge/database/repositories";
import { apiScopeSchema } from "@sellbridge/shared/public-api";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { dataEnvelope, defineApiEndpoint, noInput } from "../endpoint";
import { API_REQUESTS_PER_MINUTE } from "../rate-limit.server";

const meSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
  apiKey: z.object({
    name: z.string(),
    prefix: z.string(),
    scopes: z.array(apiScopeSchema),
    expiresAt: z.iso.datetime().nullable(),
  }),
  rateLimit: z.object({ requestsPerMinute: z.number().int() }),
});

/** The first call of any integration: checks the key and shows what it can do. */
export const getMe = defineApiEndpoint({
  method: "GET",
  path: "/me",
  operationId: "getMe",
  tag: "Conta",
  summary: "Quem sou eu",
  description:
    "Confirma que a chave funciona e mostra a organização, os escopos e o limite de requisições.",
  scope: null,
  params: noInput,
  query: noInput,
  body: noInput,
  response: dataEnvelope(meSchema),
  handle: async ({ context }) => {
    const identity = await getApiKeyIdentity(database, context.apiKeyId);
    return {
      data: {
        organization: { id: identity.organizationId, name: identity.organizationName },
        apiKey: {
          name: identity.keyName,
          prefix: identity.keyPrefix,
          scopes: identity.scopes.flatMap((scope) => {
            const parsed = apiScopeSchema.safeParse(scope);
            return parsed.success ? [parsed.data] : [];
          }),
          expiresAt: identity.expiresAt?.toISOString() ?? null,
        },
        rateLimit: { requestsPerMinute: API_REQUESTS_PER_MINUTE },
      },
    };
  },
});
