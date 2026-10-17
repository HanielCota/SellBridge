import { billingConfigured } from "@/features/billing/stripe.server";
import { randomBytes } from "node:crypto";
import {
  assertActiveSupplier,
  consumeOAuthState,
  createOAuthState,
  findOnboardingProfile,
  upsertStoreConnection,
} from "@sellbridge/database/repositories";
import { isMarketplaceError, type MarketplaceId } from "@sellbridge/marketplaces";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { marketplaceSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { appOriginFor } from "@/lib/server/app-origin";
import {
  connectors,
  oauthAuthorizationUrl,
  oauthCallbackUrl,
  tokenCipher,
} from "@/lib/server/marketplaces";
import { requireTenantSession } from "@/lib/server/tenant-session";
import type { StoreConnectErrorCode } from "./store-connect-errors";

const STATE_TTL_MILLISECONDS = 10 * 60 * 1000;

/** Stays on the trusted host of `request`, where the session cookie lives. */
function redirectTo(request: Request, path: string, params: Record<string, string> = {}): Response {
  const url = new URL(path, appOriginFor(request.url));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

/**
 * The stores page shows a fixed message for each code: free text in the URL would let any link
 * put its own words inside the app's own interface.
 */
function storesPageWithError(request: Request, code: StoreConnectErrorCode): Response {
  return redirectTo(request, "/lojas", { erro: code });
}

function connectErrorCode(error: unknown): StoreConnectErrorCode {
  if (isMarketplaceError(error)) {
    return "marketplace";
  }
  if (isAppError(error) && error.code === "CONFLICT") {
    return "shop_in_use";
  }
  return isAppError(error) && error.code === "FORBIDDEN" ? "plan_limit" : "failed";
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

const startQuerySchema = z.object({ fornecedor: z.uuid().optional() });

/**
 * The supplier the new shop sells: the one picked on the stores page (`?fornecedor=`), else the
 * one picked during onboarding. Null leaves the shop pending; undefined means the picked one is
 * gone or inactive.
 */
async function supplierForNewShop(
  request: Request,
  tenantId: string,
): Promise<string | null | undefined> {
  const query = startQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const picked = query.success ? query.data.fornecedor : undefined;
  if (picked === undefined) {
    const profile = await findOnboardingProfile(database, tenantId);
    return profile.starterSupplier?.id ?? null;
  }
  try {
    await assertActiveSupplier(database, picked);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") {
      return undefined;
    }
    throw error;
  }
  return picked;
}

/** GET /api/oauth/:marketplace/start: creates a one-time state and redirects to the consent page. */
export async function handleOAuthStart(request: Request, marketplaceParam: string | undefined) {
  const session = await tenantOrLogin(request);
  if (!session) {
    return redirectTo(request, "/login", { redirect: "/lojas" });
  }
  // A shop connected during an admin's visit would stay tied to the customer after it.
  if (session.impersonatedBy !== null) {
    return storesPageWithError(request, "impersonating");
  }
  const marketplace = parseMarketplace(marketplaceParam);
  if (!marketplace) {
    return storesPageWithError(request, "unknown_marketplace");
  }
  const connector = connectors[marketplace];
  if (!connector.isConfigured()) {
    return storesPageWithError(request, "unavailable");
  }
  const supplierId = await supplierForNewShop(request, session.tenantId);
  if (supplierId === undefined) {
    return storesPageWithError(request, "supplier_unavailable");
  }
  const state = randomBytes(24).toString("base64url");
  // PKCE verifier (RFC 7636): ignored by marketplaces that do not use it.
  const codeVerifier = randomBytes(48).toString("base64url");
  await createOAuthState(database, {
    state,
    tenantId: session.tenantId,
    marketplace,
    codeVerifier,
    ttlMilliseconds: STATE_TTL_MILLISECONDS,
    supplierId,
  });
  const appOrigin = appOriginFor(request.url);
  const authorizationUrl = oauthAuthorizationUrl(
    marketplace,
    { state, redirectUri: oauthCallbackUrl(marketplace, appOrigin), codeVerifier },
    appOrigin,
  );
  return Response.redirect(authorizationUrl, 302);
}

const callbackQuerySchema = z.union([
  z.object({ code: z.string().min(1), state: z.string().min(1) }),
  z.object({ error: z.string().min(1), state: z.string().optional() }),
]);

interface ConnectStoreInput {
  tenantId: string;
  marketplace: MarketplaceId;
  code: string;
  codeVerifier: string | null;
  supplierId: string | null;
  /** Must match the redirect URI the consent was issued for. */
  redirectUri: string;
}

/** Exchanges the authorization code and saves the store with its tokens encrypted at rest. */
async function connectStore(input: ConnectStoreInput) {
  const { tokens, shop } = await connectors[input.marketplace].exchangeCode({
    code: input.code,
    redirectUri: input.redirectUri,
    codeVerifier: input.codeVerifier ?? undefined,
  });
  return upsertStoreConnection(database, {
    billingEnabled: billingConfigured(),
    tenantId: input.tenantId,
    marketplace: input.marketplace,
    externalShopId: shop.externalShopId,
    shopName: shop.shopName,
    accessTokenEnc: tokenCipher.encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? tokenCipher.encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
    supplierId: input.supplierId,
  });
}

/** GET /api/oauth/:marketplace/callback: validates state, exchanges the code and stores encrypted tokens. */
export async function handleOAuthCallback(request: Request, marketplaceParam: string | undefined) {
  const session = await tenantOrLogin(request);
  if (!session) {
    return redirectTo(request, "/login", { redirect: "/lojas" });
  }
  // A shop connected during an admin's visit would stay tied to the customer after it.
  if (session.impersonatedBy !== null) {
    return storesPageWithError(request, "impersonating");
  }
  const marketplace = parseMarketplace(marketplaceParam);
  if (!marketplace) {
    return storesPageWithError(request, "unknown_marketplace");
  }
  const query = callbackQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return storesPageWithError(request, "invalid_response");
  }
  if ("error" in query.data) {
    return storesPageWithError(request, "cancelled");
  }
  const stateRecord = await consumeOAuthState(database, {
    state: query.data.state,
    tenantId: session.tenantId,
    marketplace,
  });
  if (!stateRecord) {
    return storesPageWithError(request, "expired");
  }

  try {
    const store = await connectStore({
      tenantId: session.tenantId,
      marketplace,
      code: query.data.code,
      codeVerifier: stateRecord.codeVerifier,
      supplierId: stateRecord.supplierId,
      redirectUri: oauthCallbackUrl(marketplace, appOriginFor(request.url)),
    });
    logger.info("store.connected", {
      tenantId: session.tenantId,
      marketplace,
      storeConnectionId: store.id,
    });
    return redirectTo(request, "/lojas", { conectada: store.id });
  } catch (error) {
    logger.warn("store.connect_failed", { tenantId: session.tenantId, marketplace, error });
    return storesPageWithError(request, connectErrorCode(error));
  }
}
