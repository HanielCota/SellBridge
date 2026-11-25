import { z } from "zod";

/**
 * What a developer key may read, across every organization. The developer ticks them one by
 * one when creating the key. `buyers:personal` adds the buyer's shipping address to orders and is
 * never ticked by default (decision of 25/11/2026).
 */
export const DEVELOPER_SCOPES = [
  "organizations:read",
  "stores:read",
  "listings:read",
  "orders:read",
  "buyers:personal",
  "financials:read",
  "suppliers:read",
  "catalog:read",
  "support:read",
] as const;

export const developerScopeSchema = z.enum(DEVELOPER_SCOPES);
export type DeveloperScope = z.infer<typeof developerScopeSchema>;

export const DEVELOPER_SCOPE_LABELS: Record<DeveloperScope, string> = {
  "organizations:read": "Organizações, planos e assinaturas",
  "stores:read": "Lojas conectadas",
  "listings:read": "Anúncios",
  "orders:read": "Pedidos, itens e lucro (comprador só com o nome)",
  "buyers:personal": "Endereço de entrega dos compradores",
  "financials:read": "Resumo financeiro por período",
  "suppliers:read": "Fornecedores, produtos e estoque",
  "catalog:read": "Catálogo",
  "support:read": "Chamados de suporte",
};

/** Personal buyer data only makes sense on top of orders, so it is refused alone. */
export const PERSONAL_DATA_SCOPE: DeveloperScope = "buyers:personal";
export const PERSONAL_DATA_REQUIRES: DeveloperScope = "orders:read";

/** The scopes of a key, without repeats; personal data without orders is refused. */
export const developerScopesSchema = z
  .array(developerScopeSchema)
  .min(1, "Escolha pelo menos um tipo de informação")
  .max(DEVELOPER_SCOPES.length * 2)
  .transform((scopes) => [...new Set(scopes)])
  .refine(
    (scopes) => !scopes.includes(PERSONAL_DATA_SCOPE) || scopes.includes(PERSONAL_DATA_REQUIRES),
    { message: "O endereço de entrega só vem junto com os pedidos: marque também “Pedidos”." },
  );

/** Drops anything stored that is no longer a known scope, instead of failing the request. */
export function knownDeveloperScopes(scopes: readonly string[]): DeveloperScope[] {
  return scopes.flatMap((scope) => {
    const parsed = developerScopeSchema.safeParse(scope);
    return parsed.success ? [parsed.data] : [];
  });
}
