import {
  type DeveloperOrganization,
  getOrganizationForDeveloper,
  listOrganizationsForDeveloper,
} from "@sellbridge/database/repositories";
import { noInput, pageQuerySchema, toPaginationMeta } from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { organizationParamsSchema } from "../organization-endpoint.server";

function presentOrganization(row: DeveloperOrganization) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    subscription: {
      plan: row.plan ?? "free",
      status: row.billingStatus ?? "free",
      periodEnd: row.periodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
    },
  };
}

export const listDeveloperOrganizations = defineDeveloperEndpoint({
  operationId: "listOrganizations",
  scope: "organizations:read",
  params: noInput,
  query: pageQuerySchema,
  handle: async ({ query }) => {
    const page = await listOrganizationsForDeveloper(database, query);
    return { data: page.items.map(presentOrganization), pagination: toPaginationMeta(page) };
  },
});

export const getDeveloperOrganization = defineDeveloperEndpoint({
  operationId: "getOrganization",
  scope: "organizations:read",
  params: organizationParamsSchema,
  query: noInput,
  handle: async ({ params }) => {
    const row = await getOrganizationForDeveloper(database, params.organizationId);
    return { data: presentOrganization(row) };
  },
});
