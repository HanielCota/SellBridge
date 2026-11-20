import { randomBytes } from "node:crypto";
import {
  createResellerErpOAuthState,
  findBillingHolder,
  upsertResellerErpConnection,
} from "@sellbridge/database/repositories";
import { isMarketplaceError } from "@sellbridge/marketplaces";
import { blingAuthorizationUrl, exchangeBlingCode } from "@sellbridge/marketplaces/bling";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { blingCredentials } from "@/features/supplier-panel/bling/bling-access.server";
import { appOriginFor } from "@/lib/server/app-origin";
import { database } from "@/lib/server/database";
import { tokenCipher } from "@/lib/server/marketplaces";
import { listMemberships } from "@/lib/server/membership";
import { requireSellerRequest } from "@/lib/server/tenant-session";
import type { ResellerBlingOutcome } from "./reseller-bling-connection";

const STATE_TTL_IN_MS = 10 * 60 * 1000;
/** 192 random bits for the one-time OAuth state. */
const STATE_BYTES = 24;
const INTEGRATIONS_PAGE = "/integracoes";

/** Back to Integrações with a fixed outcome, on the reseller's own profile when known. */
export function integrationsPage(
  request: Request,
  outcome: ResellerBlingOutcome,
  profileSlug?: string,
): Response {
  const url = new URL(INTEGRATIONS_PAGE, appOriginFor(request.url));
  url.searchParams.set("bling", outcome);
  if (profileSlug !== undefined) {
    url.searchParams.set("perfil", profileSlug);
  }
  return Response.redirect(url.toString(), 302);
}

function loginPage(request: Request): Response {
  const url = new URL("/login", appOriginFor(request.url));
  url.searchParams.set("redirect", INTEGRATIONS_PAGE);
  return Response.redirect(url.toString(), 302);
}

async function sellerOf(request: Request) {
  try {
    return await requireSellerRequest(request);
  } catch (error) {
    if (isAppError(error) && error.code === "UNAUTHORIZED") {
      return null;
    }
    throw error;
  }
}

/**
 * GET /api/integracoes/bling/revenda: the reseller selling as a company is sent to Bling's
 * consent page with a one-time state, to connect its own account for its sale notes.
 */
export async function handleResellerBlingConnectStart(request: Request): Promise<Response> {
  const seller = await sellerOf(request);
  if (seller === null) {
    return loginPage(request);
  }
  if (seller.impersonatedBy !== null) {
    return integrationsPage(request, "visita");
  }
  const credentials = blingCredentials();
  if (credentials === null) {
    return integrationsPage(request, "indisponivel");
  }
  const holder = await findBillingHolder(database, seller.tenantId);
  if ((holder?.company?.cnpj ?? null) === null) {
    return integrationsPage(request, "sem_empresa");
  }
  const state = randomBytes(STATE_BYTES).toString("base64url");
  await createResellerErpOAuthState(database, {
    state,
    tenantId: seller.tenantId,
    userId: seller.userId,
    provider: "bling",
    ttlMilliseconds: STATE_TTL_IN_MS,
  });
  return Response.redirect(blingAuthorizationUrl({ clientId: credentials.clientId, state }), 302);
}

async function saveConnection(input: { tenantId: string; userId: string; code: string }) {
  const credentials = blingCredentials();
  if (credentials === null) {
    return "indisponivel" as const;
  }
  try {
    const tokens = await exchangeBlingCode({ fetchImplementation: fetch, credentials }, input.code);
    await upsertResellerErpConnection(database, {
      tenantId: input.tenantId,
      provider: "bling",
      userId: input.userId,
      tokens: {
        accessTokenEnc: tokenCipher.encrypt(tokens.accessToken),
        refreshTokenEnc: tokenCipher.encrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });
    logger.info("reseller_bling.connected", { tenantId: input.tenantId });
    return "conectado" as const;
  } catch (error) {
    if (!isMarketplaceError(error)) {
      throw error;
    }
    logger.warn("reseller_bling.connect_failed", { tenantId: input.tenantId, error });
    return "falhou" as const;
  }
}

/**
 * The reseller's return from Bling: the user must still be a member of that seller profile, and
 * no team visit may connect it, before the code is traded for tokens.
 */
export async function finishResellerBlingConnect(
  request: Request,
  input: { tenantId: string; userId: string; impersonatedBy: string | null; code: string },
): Promise<Response> {
  if (input.impersonatedBy !== null) {
    return integrationsPage(request, "visita");
  }
  const memberships = await listMemberships(input.userId);
  const profile = memberships.find(
    (membership) => membership.organizationId === input.tenantId && membership.kind === "seller",
  );
  if (profile === undefined) {
    return integrationsPage(request, "sem_permissao");
  }
  const outcome = await saveConnection(input);
  return integrationsPage(request, outcome, profile.slug);
}
