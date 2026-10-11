import { z } from "zod";

/**
 * What an API key may do. Read and write are separate so an integration that only exports
 * sales never holds a key able to change prices.
 */
export const API_SCOPES = [
  "catalog:read",
  "stores:read",
  "listings:read",
  "listings:write",
  "orders:read",
  "financials:read",
  "events:read",
  "webhooks:manage",
] as const;

export const apiScopeSchema = z.enum(API_SCOPES);
export type ApiScope = z.infer<typeof apiScopeSchema>;

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "catalog:read": "Ler o catálogo da região",
  "stores:read": "Ler as lojas conectadas",
  "listings:read": "Ler anúncios",
  "listings:write": "Criar anúncios, mudar preço, pausar e reativar",
  "orders:read": "Ler pedidos",
  "financials:read": "Ler o resumo financeiro",
  "events:read": "Ler eventos",
  "webhooks:manage": "Gerenciar webhooks",
};

/** Every scope but writing: what a key gets when the person doesn't choose. */
export const READ_ONLY_SCOPES: readonly ApiScope[] = API_SCOPES.filter((scope) =>
  scope.endsWith(":read"),
);
