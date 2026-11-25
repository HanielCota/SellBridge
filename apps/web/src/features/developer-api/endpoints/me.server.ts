import { noInput } from "@/features/public-api/endpoint";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { DEVELOPER_REQUESTS_PER_MINUTE } from "../developer-rate-limit.server";

/** The first call from another project: checks the key and shows what it may read. */
export const getDeveloperMe = defineDeveloperEndpoint({
  operationId: "getDeveloperMe",
  scope: null,
  params: noInput,
  query: noInput,
  handle: async ({ caller }) => ({
    data: {
      key: {
        name: caller.name,
        prefix: caller.prefix,
        scopes: caller.scopes,
        expiresAt: caller.expiresAt.toISOString(),
      },
      rateLimit: { requestsPerMinute: DEVELOPER_REQUESTS_PER_MINUTE },
    },
  }),
});
