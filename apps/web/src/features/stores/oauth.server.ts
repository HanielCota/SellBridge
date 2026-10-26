import { billingConfigured } from "@/features/billing/stripe.server";
import { randomBytes } from "node:crypto";
import {
  assertActiveSupplier,
  consumeOAuthState,
  findOAuthStateProfile,
  createOAuthState,
  findOnboardingProfile,
  hasLiveStoreConnection,
  isUserEmailVerified,
  upsertStoreConnection,
} from "@sellbridge/database/repositories";
import { isMarketplaceError, type MarketplaceId } from "@sellbridge/marketplaces";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { marketplaceSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { PROFILE_HEADER, requestedProfileOf } from "@/lib/profile-param";
import { database } from "@/lib/server/database";
import { appOriginFor } from "@/lib/server/app-origin";
import {
  connectors,
  oauthAuthorizationUrl,
  oauthCallbackUrl,
  tokenCipher,
} from "@/lib/server/marketplaces";
import { requireSellerRequest, type TenantSession } from "@/lib/server/tenant-session";
import type { StoreConnectErrorCode } from "./store-connect-errors";

const STATE_TTL_MILLISECONDS = 10 * 60 * 1000;

/** Stays on the trusted host of `request`, where the session cookie lives. */
function redirectTo(request: Request, path: string, params: Record<string, string> = {}): Response {
  const url = new URL(path, appOriginFor(request.url));
  const profile = requestedProfileOf(request);
  if (profile !== null) {
    url.searchParams.set("perfil", profile);
  }
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

function requestWithProfile(request: Request, profile: string): Request {
  const url = new URL(request.url);
  url.searchParams.set("perfil", profile);
  const headers = new Headers(request.headers);
  headers.set(PROFILE_HEADER, profile);
  return new Request(url, { headers });
}

async function tenantOrLogin(request: Request, marketplace?: MarketplaceId) {
  let scopedRequest = request;
  try {
    if (marketplace !== undefined) {
      const account = await auth.api.getSession({ headers: request.headers });
      if (!account) {
        return null;
      }
      const state = new URL(request.url).searchParams.get("state");
      const profile =
        state === null
          ? null
          : await findOAuthStateProfile(database, {
              state,
              marketplace,
              userId: account.user.id,
            });
      if (profile !== null) {
        scopedRequest = requestWithProfile(request, profile);
      }
    }
    return {
      ...(await requireSellerRequest(scopedRequest)),
      profileSlug: requestedProfileOf(scopedRequest),
    };
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
    if (profile.productSourceMode === "own") return null;
    if (profile.starterSupplier?.active === false) return undefined;
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
  const authorizationUrl = oauthAuthorizationUrl(marketplace, {
    state,
    redirectUri: oauthCallbackUrl(marketplace),
    codeVerifier,
  });
  const url = new URL(authorizationUrl);
  return Response.redirect(url, 302);
}

const callbackQuerySchema = z.union([
  z.object({ code: z.string().min(1), state: z.string().min(1) }),
  z.object({ error: z.string().min(1), state: z.string().optional() }),
]);

interface ConnectStoreInput {
  tenantId: string;
  userId: string;
  marketplace: MarketplaceId;
  code: string;
  codeVerifier: string | null;
  supplierId: string | null;
  /** Must match the redirect URI the consent was issued for. */
  redirectUri: string;
}

/**
 * Reconnecting a shop the account has is always allowed; a new one needs a confirmed e-mail
 * (item 26.b, L1).
 */
async function mayConnectShop(input: ConnectStoreInput, externalShopId: string) {
  if (await isUserEmailVerified(database, input.userId)) {
    return true;
  }
  const shop = { tenantId: input.tenantId, marketplace: input.marketplace, externalShopId };
  return hasLiveStoreConnection(database, shop);
}

/**
 * Exchanges the authorization code and saves the store with its tokens encrypted at rest; null
 * when the shop is new and the e-mail is not confirmed yet.
 */
async function connectStore(input: ConnectStoreInput) {
  const { tokens, shop } = await connectors[input.marketplace].exchangeCode({
    code: input.code,
    redirectUri: input.redirectUri,
    codeVerifier: input.codeVerifier ?? undefined,
  });
  if (!(await mayConnectShop(input, shop.externalShopId))) {
    return null;
  }
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
export async function handleOAuthCallback(
  originalRequest: Request,
  marketplaceParam: string | undefined,
) {
  const session = await tenantOrLogin(
    originalRequest,
    parseMarketplace(marketplaceParam) ?? undefined,
  );
  const request = session?.profileSlug
    ? requestWithProfile(originalRequest, session.profileSlug)
    : originalRequest;
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

  return completeOAuthConnection(request, marketplace, session, {
    code: query.data.code,
    ...stateRecord,
  });
}

async function completeOAuthConnection(
  request: Request,
  marketplace: MarketplaceId,
  session: TenantSession,
  stateRecord: { code: string; codeVerifier: string | null; supplierId: string | null },
) {
  try {
    const store = await connectStore({
      tenantId: session.tenantId,
      userId: session.userId,
      marketplace,
      code: stateRecord.code,
      codeVerifier: stateRecord.codeVerifier,
      supplierId: stateRecord.supplierId,
      redirectUri: oauthCallbackUrl(marketplace),
    });
    if (store === null) {
      logger.info("store.connect_needs_verified_email", {
        tenantId: session.tenantId,
        marketplace,
      });
      return storesPageWithError(request, "email_not_verified");
    }
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
