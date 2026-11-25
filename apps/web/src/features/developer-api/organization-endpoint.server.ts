import { getOrganizationForDeveloper } from "@sellbridge/database/repositories";
import type { DeveloperScope } from "@sellbridge/shared/developer-api";
import { z } from "zod";
import type { ApiEndpoint, noInput } from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import type { DeveloperCaller } from "./developer-authenticate.server";
import { defineDeveloperEndpoint } from "./developer-endpoint.server";

/** Organization ids come from the auth library: text, not uuid. */
export const organizationParamsSchema = z.object({
  organizationId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe("Id da organização (veja `GET /organizations`)."),
});

/** A read operation of the organizations' own API, reused for any organization. */
type OrganizationRead<
  TParams extends z.ZodObject,
  TQuery extends z.ZodType,
  TResponse extends z.ZodType,
> = ApiEndpoint<TParams, TQuery, typeof noInput, TResponse>;

interface OrganizationReadInput<TParams extends z.ZodObject, TQuery extends z.ZodType> {
  caller: DeveloperCaller;
  params: { organizationId: string } & z.output<TParams>;
  query: z.output<TQuery>;
  requestId: string;
  now: Date;
}

/**
 * Confirms the organization exists. An unknown organization is a 404 instead of empty lists, so
 * a typo in the id never looks like "no data".
 *
 * @throws notFound when no organization has this id.
 */
export async function requireOrganization(organizationId: string): Promise<string> {
  const organization = await getOrganizationForDeveloper(database, organizationId);
  return organization.id;
}

/** Runs an organization API read as if that organization's key had called it. */
export async function readAsOrganization<
  TParams extends z.ZodObject,
  TQuery extends z.ZodType,
  TResponse extends z.ZodType,
>(
  endpoint: OrganizationRead<TParams, TQuery, TResponse>,
  input: OrganizationReadInput<TParams, TQuery>,
) {
  const tenantId = await requireOrganization(input.params.organizationId);
  return endpoint.handle({
    context: {
      tenantId,
      apiKeyId: input.caller.developerApiKeyId,
      requestId: input.requestId,
      now: input.now,
    },
    params: input.params,
    query: input.query,
    body: {},
  });
}

/** The developer version of an organization API read, under `/organizations/{organizationId}`. */
export function forOrganization<
  TParams extends z.ZodObject,
  TQuery extends z.ZodType,
  TResponse extends z.ZodType,
>(endpoint: OrganizationRead<TParams, TQuery, TResponse>, scope: DeveloperScope) {
  return defineDeveloperEndpoint({
    path: `/organizations/{organizationId}${endpoint.path}`,
    operationId: endpoint.operationId,
    tag: endpoint.tag,
    summary: endpoint.summary,
    description: endpoint.description,
    scope,
    params: organizationParamsSchema.and(endpoint.params),
    query: endpoint.query,
    response: endpoint.response,
    handle: async (input) => readAsOrganization(endpoint, input),
  });
}
