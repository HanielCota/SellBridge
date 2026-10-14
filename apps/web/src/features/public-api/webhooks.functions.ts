import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertNotImpersonating } from "@/lib/server/impersonation";
import { tenantMiddleware } from "@/lib/server/middleware";
import { createWebhookEndpointInputSchema } from "./webhooks";
import {
  createOrganizationWebhookEndpoint,
  deleteOrganizationWebhookEndpoint,
  listOrganizationWebhookEndpoints,
  setOrganizationWebhookEndpointEnabled,
} from "./webhooks.server";

/** Every endpoint of the organization with its latest deliveries; secrets are never returned. */
export const getWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => listOrganizationWebhookEndpoints(context.tenantId));

/** Creates an endpoint and returns its signing secret this one time. */
export const createWebhookEndpointFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(createWebhookEndpointInputSchema)
  .handler(async ({ context, data }) => {
    await assertNotImpersonating("criar webhooks");
    return createOrganizationWebhookEndpoint({
      tenantId: context.tenantId,
      actor: { userId: context.userId },
      request: data,
    });
  });

export const deleteWebhookEndpointFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ endpointId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await deleteOrganizationWebhookEndpoint({
      tenantId: context.tenantId,
      actor: { userId: context.userId },
      endpointId: data.endpointId,
    });
    return { ok: true };
  });

/** Disabling keeps pending deliveries; they are sent once the endpoint is enabled again. */
export const setWebhookEndpointEnabledFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ endpointId: z.uuid(), enabled: z.boolean() }))
  .handler(async ({ context, data }) =>
    setOrganizationWebhookEndpointEnabled({
      tenantId: context.tenantId,
      actor: { userId: context.userId },
      endpointId: data.endpointId,
      enabled: data.enabled,
    }),
  );
