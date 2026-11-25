import {
  type DeveloperOrganization,
  getOrganizationForDeveloper,
  listOrganizationsForDeveloper,
} from "@sellbridge/database/repositories";
import { z } from "zod";
import {
  dataEnvelope,
  noInput,
  pageEnvelope,
  pageQuerySchema,
  toPaginationMeta,
} from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { organizationParamsSchema } from "../organization-endpoint.server";

const organizationSchema = z.object({
  id: z.string().describe("Use nas rotas `/organizations/{organizationId}/...`."),
  name: z.string(),
  slug: z.string(),
  kind: z.enum(["seller", "supplier"]).describe("`seller`: revendedor; `supplier`: fornecedor."),
  createdAt: z.iso.datetime(),
  subscription: z.object({
    plan: z.string().describe("Plano atual; `free` quando nunca assinou."),
    status: z.string().describe("Situação da assinatura; `free` quando nunca assinou."),
    periodEnd: z.iso.datetime().nullable().describe("Fim do período já pago."),
    cancelAtPeriodEnd: z.boolean(),
  }),
});

function presentOrganization(row: DeveloperOrganization): z.input<typeof organizationSchema> {
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
  path: "/organizations",
  operationId: "listOrganizations",
  tag: "Organizações",
  summary: "Listar organizações",
  description:
    "Todas as contas do SellBridge (revendedores e fornecedores), das mais antigas às mais novas, com o plano.",
  scope: "organizations:read",
  params: noInput,
  query: pageQuerySchema,
  response: pageEnvelope(organizationSchema),
  handle: async ({ query }) => {
    const page = await listOrganizationsForDeveloper(database, query);
    return { data: page.items.map(presentOrganization), pagination: toPaginationMeta(page) };
  },
});

export const getDeveloperOrganization = defineDeveloperEndpoint({
  path: "/organizations/{organizationId}",
  operationId: "getOrganization",
  tag: "Organizações",
  summary: "Ver uma organização",
  scope: "organizations:read",
  params: organizationParamsSchema,
  query: noInput,
  response: dataEnvelope(organizationSchema),
  handle: async ({ params }) => {
    const row = await getOrganizationForDeveloper(database, params.organizationId);
    return { data: presentOrganization(row) };
  },
});
