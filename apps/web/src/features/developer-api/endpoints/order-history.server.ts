import {
  findSealedShippingAddress,
  listOrderClaims,
  listOrderStatusChanges,
  type MarketplaceClaimView,
} from "@sellbridge/database/repositories";
import { z } from "zod";
import { dataEnvelope, noInput } from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { organizationParamsSchema, requireOrganization } from "../organization-endpoint.server";

const statusChangeSchema = z.object({ status: z.string(), at: z.iso.datetime() });

const claimSchema = z.object({
  externalClaimId: z.string().describe("Id da reclamação no marketplace."),
  status: z.string(),
  type: z.string().nullable(),
  stage: z.string().nullable(),
  reasonId: z.string().nullable(),
  problem: z.string().nullable(),
  actionResponsible: z.string().nullable().describe("Quem precisa agir agora."),
  actionDueAt: z.iso.datetime().nullable(),
  resolutionReason: z.string().nullable(),
  closedAt: z.iso.datetime().nullable(),
  returnStatus: z.string().nullable().describe("Situação da devolução, quando há."),
  returnTrackingCode: z.string().nullable(),
  returnDestination: z.string().nullable(),
  moneyStatus: z.string().nullable().describe("Situação do dinheiro da venda na reclamação."),
  openedAt: z.iso.datetime(),
});

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function presentClaim(claim: MarketplaceClaimView): z.input<typeof claimSchema> {
  return {
    ...claim,
    actionDueAt: isoOrNull(claim.actionDueAt),
    closedAt: isoOrNull(claim.closedAt),
    openedAt: claim.openedAt.toISOString(),
  };
}

export const getDeveloperOrderHistory = defineDeveloperEndpoint({
  path: "/organizations/{organizationId}/orders/{orderId}/history",
  operationId: "getOrderHistory",
  tag: "Pedidos",
  summary: "Ver o histórico de um pedido",
  description:
    "As mudanças de situação do pedido, da mais antiga para a mais nova, e as reclamações e devoluções abertas no marketplace, da mais recente para a mais antiga.",
  scope: "orders:read",
  params: organizationParamsSchema.extend({ orderId: z.uuid().describe("Id do pedido.") }),
  query: noInput,
  response: dataEnvelope(
    z.object({ statusChanges: z.array(statusChangeSchema), claims: z.array(claimSchema) }),
  ),
  handle: async ({ params }) => {
    const organizationId = await requireOrganization(params.organizationId);
    // Answers 404 for an order of another organization; the sealed address itself is discarded.
    await findSealedShippingAddress(database, organizationId, params.orderId);
    const input = { tenantId: organizationId, orderId: params.orderId };
    const [statusChanges, claims] = await Promise.all([
      listOrderStatusChanges(database, input.tenantId, input.orderId),
      listOrderClaims(database, input),
    ]);
    return {
      data: {
        statusChanges: statusChanges.map((change) => ({
          status: change.status,
          at: change.at.toISOString(),
        })),
        claims: claims.map(presentClaim),
      },
    };
  },
});
