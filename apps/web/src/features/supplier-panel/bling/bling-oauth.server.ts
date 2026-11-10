import { randomBytes } from "node:crypto";
import {
  consumeErpOAuthState,
  createErpOAuthState,
  findSupplierOfProfile,
  upsertErpConnection,
} from "@sellbridge/database/repositories";
import { isMarketplaceError } from "@sellbridge/marketplaces";
import { blingAuthorizationUrl, exchangeBlingCode } from "@sellbridge/marketplaces/bling";
import { logger } from "@sellbridge/shared/logger";
import { auth } from "@/lib/server/auth";
import { appOriginFor } from "@/lib/server/app-origin";
import { database } from "@/lib/server/database";
import { tokenCipher } from "@/lib/server/marketplaces";
import { listMemberships, type Membership } from "@/lib/server/membership";
import { blingCredentials } from "./bling-access.server";
import {
  blingCallbackQuerySchema,
  blingStartQuerySchema,
  erpConnectRefusal,
  type BlingConnectOutcome,
} from "./bling-connection";

const STATE_TTL_IN_MS = 10 * 60 * 1000;
/** 192 random bits for the one-time OAuth state. */
const STATE_BYTES = 24;
const IMPORT_PAGE = "/fornecedor/painel/importar";

interface SupplierProfile {
  readonly supplierId: string;
  readonly slug: string;
}

/** The supplier profiles the user is a member of, with the supplier behind each. */
async function supplierProfilesOf(memberships: readonly Membership[]): Promise<SupplierProfile[]> {
  const supplierMemberships = memberships.filter((membership) => membership.kind === "supplier");
  const found = await Promise.all(
    supplierMemberships.map(async (membership) => {
      const supplier = await findSupplierOfProfile(database, membership.organizationId);
      return supplier === null ? null : { supplierId: supplier.id, slug: membership.slug };
    }),
  );
  return found.filter((profile) => profile !== null);
}

/** Back to the import page with a fixed outcome, on the supplier's own profile when known. */
function importPage(request: Request, outcome: BlingConnectOutcome, profileSlug?: string) {
  const url = new URL(IMPORT_PAGE, appOriginFor(request.url));
  url.searchParams.set("bling", outcome);
  if (profileSlug !== undefined) {
    url.searchParams.set("perfil", profileSlug);
  }
  return Response.redirect(url.toString(), 302);
}

function loginPage(request: Request) {
  const url = new URL("/login", appOriginFor(request.url));
  url.searchParams.set("redirect", IMPORT_PAGE);
  return Response.redirect(url.toString(), 302);
}

async function signedInRequester(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return null;
  }
  const profiles = await supplierProfilesOf(await listMemberships(session.user.id));
  return {
    userId: session.user.id,
    impersonatedBy: session.session.impersonatedBy ?? null,
    profiles,
  };
}

/**
 * GET /api/integracoes/bling/conectar?fornecedor=<id>: a member of that supplier's profile is
 * sent to Bling's consent page with a one-time state.
 */
export async function handleBlingConnectStart(request: Request): Promise<Response> {
  const requester = await signedInRequester(request);
  if (requester === null) {
    return loginPage(request);
  }
  const credentials = blingCredentials();
  if (credentials === null) {
    return importPage(request, "indisponivel");
  }
  const query = blingStartQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return importPage(request, "sem_permissao");
  }
  const supplierId = query.data.fornecedor;
  const supplierIds = requester.profiles.map((profile) => profile.supplierId);
  const refusal = erpConnectRefusal(
    { supplierIds, impersonatedBy: requester.impersonatedBy },
    supplierId,
  );
  if (refusal !== null) {
    return importPage(request, refusal);
  }
  const state = randomBytes(STATE_BYTES).toString("base64url");
  await createErpOAuthState(database, {
    state,
    supplierId,
    userId: requester.userId,
    provider: "bling",
    ttlMilliseconds: STATE_TTL_IN_MS,
  });
  return Response.redirect(blingAuthorizationUrl({ clientId: credentials.clientId, state }), 302);
}

async function saveConnection(input: { supplierId: string; userId: string; code: string }) {
  const credentials = blingCredentials();
  if (credentials === null) {
    return "indisponivel" as const;
  }
  try {
    const tokens = await exchangeBlingCode({ fetchImplementation: fetch, credentials }, input.code);
    await upsertErpConnection(database, {
      supplierId: input.supplierId,
      provider: "bling",
      userId: input.userId,
      tokens: {
        accessTokenEnc: tokenCipher.encrypt(tokens.accessToken),
        refreshTokenEnc: tokenCipher.encrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });
    logger.info("bling.connected", { supplierId: input.supplierId });
    return "conectado" as const;
  } catch (error) {
    if (!isMarketplaceError(error)) {
      throw error;
    }
    logger.warn("bling.connect_failed", { supplierId: input.supplierId, error });
    return "falhou" as const;
  }
}

/**
 * GET /api/integracoes/bling/retorno: the state must be this user's and fresh, and the user must
 * still be a member of that supplier's profile, before the code is traded for tokens.
 */
export async function handleBlingConnectCallback(request: Request): Promise<Response> {
  const requester = await signedInRequester(request);
  if (requester === null) {
    return loginPage(request);
  }
  const query = blingCallbackQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return importPage(request, "resposta_invalida");
  }
  if ("error" in query.data) {
    return importPage(request, "cancelado");
  }
  const stateRecord = await consumeErpOAuthState(database, {
    state: query.data.state,
    userId: requester.userId,
    provider: "bling",
  });
  if (stateRecord === null) {
    return importPage(request, "expirado");
  }
  const profile = requester.profiles.find((item) => item.supplierId === stateRecord.supplierId);
  const supplierIds = requester.profiles.map((item) => item.supplierId);
  const refusal = erpConnectRefusal(
    { supplierIds, impersonatedBy: requester.impersonatedBy },
    stateRecord.supplierId,
  );
  if (refusal !== null || profile === undefined) {
    return importPage(request, refusal ?? "sem_permissao");
  }
  const outcome = await saveConnection({
    supplierId: stateRecord.supplierId,
    userId: requester.userId,
    code: query.data.code,
  });
  return importPage(request, outcome, profile.slug);
}
