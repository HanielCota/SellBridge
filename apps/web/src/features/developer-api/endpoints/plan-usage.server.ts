import { z } from "zod";
import { findPlanRoom } from "@/features/billing/plan-room.server";
import { dataEnvelope, noInput } from "@/features/public-api/endpoint";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { organizationParamsSchema, requireOrganization } from "../organization-endpoint.server";

const countsSchema = z.object({ stores: z.number().int(), listings: z.number().int() });

const planUsageSchema = z.object({
  situation: z
    .enum(["plan", "no_plan", "unlimited"])
    .describe(
      "`plan`: tem um plano com limite; `no_plan`: sem plano, não pode publicar nem conectar lojas; `unlimited`: cobrança desligada ou período de lançamento, sem limite.",
    ),
  plan: z
    .object({ id: z.string(), name: z.string() })
    .nullable()
    .describe("O plano em uso, incluindo o gratuito; null sem plano ou sem limite."),
  allowed: countsSchema.nullable().describe("O que o plano permite; null quando não há limite."),
  used: countsSchema.describe(
    "Lojas conectadas e anúncios que contam no plano (os com erro não contam).",
  ),
  left: countsSchema
    .nullable()
    .describe("O que ainda cabe, nunca negativo; null quando não há limite."),
});

export const getDeveloperPlanUsage = defineDeveloperEndpoint({
  path: "/organizations/{organizationId}/plan-usage",
  operationId: "getPlanUsage",
  tag: "Organizações",
  summary: "Ver o uso do plano",
  description:
    "Quantas lojas e anúncios o plano da organização permite, quantos ela já usa e quantos ainda cabem.",
  scope: "organizations:read",
  params: organizationParamsSchema,
  query: noInput,
  response: dataEnvelope(planUsageSchema),
  handle: async ({ params }) => {
    const organizationId = await requireOrganization(params.organizationId);
    const room = await findPlanRoom(organizationId);
    if (room.kind === "unlimited") {
      return {
        data: {
          situation: "unlimited" as const,
          plan: null,
          allowed: null,
          used: room.used,
          left: null,
        },
      };
    }
    return {
      data: {
        situation: room.kind,
        plan: room.kind === "plan" ? { id: room.planId, name: room.planName } : null,
        allowed: room.allowed,
        used: room.used,
        left: room.left,
      },
    };
  },
});
