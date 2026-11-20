import { gzipSync } from "node:zlib";
import {
  createBlingClient,
  createBlingRateLimiter,
  type BlingAppCredentials,
  type BlingClient,
} from "@sellbridge/marketplaces/bling";
import { blingCredentialsFrom } from "../src/features/supplier-panel/bling/bling-connection";
import { environment } from "../src/lib/server/environment";
import { E2E_INVOICE_FILES } from "./bling-invoice.fixture";

/*
 * Stands in for the web's Bling access in the specs: the real client, talking to a fake Bling
 * that answers the NF-e file call and the list of operations ("naturezas de operação"). Nothing
 * reaches the real Bling, nor any supplier's account.
 */

/** The fake account's active operations, by the names most Bling accounts give them. */
export const E2E_BLING_OPERATIONS = [
  { id: 501, descricao: "Venda de mercadorias" },
  { id: 502, descricao: "Remessa por conta e ordem de terceiros" },
  { id: 503, descricao: "Venda à ordem" },
] as const;

/** The fake account's active payment methods: Pix and a Mastercard credit card. */
export const E2E_BLING_PAYMENT_METHODS = [
  { id: 601, descricao: "Pix", tipoPagamento: 17 },
  { id: 602, descricao: "Cartão de crédito Mastercard", tipoPagamento: 3 },
] as const;
const E2E_MASTERCARD_BRAND = 2;

const limiter = createBlingRateLimiter();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function fakeBling(input: string): Promise<Response> {
  const url = new URL(input);
  if (url.pathname.endsWith("/naturezas-operacoes")) {
    return json(200, { data: E2E_BLING_OPERATIONS.map((operation) => ({ ...operation })) });
  }
  if (url.pathname.endsWith("/formas-pagamentos")) {
    return json(200, { data: E2E_BLING_PAYMENT_METHODS.map((method) => ({ ...method })) });
  }
  if (url.pathname.endsWith("/formas-pagamentos/602")) {
    return json(200, { data: { dadosCartao: { bandeira: E2E_MASTERCARD_BRAND } } });
  }
  const document = /\/nfe\/documento\/\d{44}$/.test(url.pathname);
  const format = url.searchParams.get("formato");
  if (!document || (format !== "xml" && format !== "pdf")) {
    return json(404, { error: { type: "RESOURCE_NOT_FOUND", message: "Não encontrado" } });
  }
  const conteudo = gzipSync(Buffer.from(E2E_INVOICE_FILES[format])).toString("base64");
  return json(200, { data: [{ conteudo }] });
}

export function blingCredentials(): BlingAppCredentials | null {
  return blingCredentialsFrom(environment);
}

export function supplierBlingClient(supplierId: string): BlingClient {
  return standInClient(supplierId);
}

export function resellerBlingClient(tenantId: string): BlingClient {
  return standInClient(`reseller:${tenantId}`);
}

function standInClient(accountKey: string): BlingClient {
  return createBlingClient({
    http: { fetchImplementation: fakeBling },
    limiter,
    access: {
      accountKey,
      currentTokens: async () => ({
        accessToken: "e2e-not-a-token",
        refreshToken: "e2e-not-a-token",
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
      refresh: async () => {
        throw new Error("The e2e Bling stand-in never refreshes");
      },
    },
  });
}
