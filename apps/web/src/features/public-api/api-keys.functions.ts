import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { createApiKeyInputSchema } from "./api-keys";
import { issueApiKey, listOrganizationApiKeys, revokeOrganizationApiKey } from "./api-keys.server";

/** Every key of the organization, revoked ones included; secrets are never returned. */
export const getApiKeys = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => listOrganizationApiKeys(context.tenantId));

/** Creates a key and returns its secret this one time. */
export const createApiKeyFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(createApiKeyInputSchema)
  .handler(async ({ context, data }) =>
    issueApiKey({ tenantId: context.tenantId, userId: context.userId, request: data }),
  );

export const revokeApiKeyFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ apiKeyId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await revokeOrganizationApiKey({
      tenantId: context.tenantId,
      userId: context.userId,
      apiKeyId: data.apiKeyId,
    });
    return { ok: true };
  });
