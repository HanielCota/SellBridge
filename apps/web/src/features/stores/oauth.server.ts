import { randomBytes } from "node:crypto";
import {
  consumeOAuthState,
  createOAuthState,
  upsertStoreConnection,
} from "@sellbridge/db/repositories";
import { isMarketplaceError, type MarketplaceId } from "@sellbridge/marketplaces";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { marketplaceSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { connectors, oauthCallbackUrl, tokenCipher } from "@/lib/server/marketplaces";
import { requireTenantSession } from "@/lib/server/tenant-session";

const STATE_TTL_MS = 10 * 60 * 1000;

function redirectTo(path: string, params: Record<string, string> = {}): Response {
  const url = new URL(path, env.APP_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

function storesPageWithError(message: string): Response {
  return redirectTo("/lojas", { erro: message });
}

function parseMarketplace(value: string | undefined): MarketplaceId | null {
  const parsed = marketplaceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function tenantOrLogin(request: Request) {
  try {
    return await requireTenantSession(request.headers);
  } catch (error) {
    if (isAppError(error) && error.code === "UNAUTHORIZED") {
      return null;
    }
    throw error;
  }
}

/** GET /api/oauth/:marketplace/start — creates a one-time state and redirects to the consent page. */
export async function handleOAuthStart(request: Request, marketplaceParam: string | undefined) {
  const session = await tenantOrLogin(request);
  if (!session) {
    return redirectTo("/login", { redirect: "/lojas" });
  }
  const marketplace = parseMarketplace(marketplaceParam);
  if (!marketplace) {
    return storesPageWithError("Marketplace desconhecido");
  }
  const connector = connectors[marketplace];
  if (!connector.isConfigured()) {
    return storesPageWithError(`${connector.displayName} ainda não está disponível`);
  }
  const state = randomBytes(24).toString("base64url");
  await createOAuthState(db, {
    state,
    tenantId: session.tenantId,
    marketplace,
    codeVerifier: null,
    ttlMs: STATE_TTL_MS,
  });
  const authorizationUrl = connector.getAuthorizationUrl({
    state,
    redirectUri: oauthCallbackUrl(marketplace),
  });
  return Response.redirect(authorizationUrl, 302);
}

const callbackQuerySchema = z.union([
  z.object({ code: z.string().min(1), state: z.string().min(1) }),
  z.object({ error: z.string().min(1), state: z.string().optional() }),
]);

/** GET /api/oauth/:marketplace/callback — validates state, exchanges the code and stores encrypted tokens. */
export async function handleOAuthCallback(request: Request, marketplaceParam: string | undefined) {
  const session = await tenantOrLogin(request);
  if (!session) {
    return redirectTo("/login", { redirect: "/lojas" });
  }
  const marketplace = parseMarketplace(marketplaceParam);
  if (!marketplace) {
    return storesPageWithError("Marketplace desconhecido");
  }
  const query = callbackQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return storesPageWithError("Resposta de autorização inválida");
  }
  if ("error" in query.data) {
    return storesPageWithError("A conexão foi cancelada no marketplace");
  }
  const stateRecord = await consumeOAuthState(db, {
    state: query.data.state,
    tenantId: session.tenantId,
    marketplace,
  });
  if (!stateRecord) {
    return storesPageWithError("A solicitação de conexão expirou. Tente conectar novamente.");
  }

  try {
    const { tokens, shop } = await connectors[marketplace].exchangeCode({
      code: query.data.code,
      redirectUri: oauthCallbackUrl(marketplace),
      codeVerifier: stateRecord.codeVerifier ?? undefined,
    });
    const store = await upsertStoreConnection(db, {
      tenantId: session.tenantId,
      marketplace,
      externalShopId: shop.externalShopId,
      shopName: shop.shopName,
      accessTokenEnc: tokenCipher.encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? tokenCipher.encrypt(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
    });
    logger.info("store.connected", {
      tenantId: session.tenantId,
      marketplace,
      storeConnectionId: store.id,
    });
    return redirectTo("/lojas", { conectada: store.shopName });
  } catch (error) {
    logger.warn("store.connect_failed", { tenantId: session.tenantId, marketplace, error });
    const message = isMarketplaceError(error)
      ? error.userMessage
      : "Não foi possível conectar a loja";
    return storesPageWithError(message);
  }
}
