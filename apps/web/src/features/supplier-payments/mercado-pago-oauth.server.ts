import { randomBytes } from "node:crypto";
import {
  consumePaymentOAuthState,
  createPaymentOAuthState,
  findSupplierOfProfile,
  upsertSupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { auth } from "@/lib/server/auth";
import { appOriginFor } from "@/lib/server/app-origin";
import { database } from "@/lib/server/database";
import { tokenCipher } from "@/lib/server/marketplaces";
import { listMemberships, type Membership } from "@/lib/server/membership";
import { mercadoPagoRedirectUri, mercadoPagoSettings } from "./mercado-pago-accounts.server";
import {
  exchangeMercadoPagoCode,
  isMercadoPagoError,
  mercadoPagoAuthorizationUrl,
} from "./mercado-pago-client.server";
import {
  mercadoPagoCallbackQuerySchema,
  mercadoPagoStartQuerySchema,
  paymentAccountLinkRefusal,
  type MercadoPagoConnectOutcome,
} from "./mercado-pago-connection";

const STATE_TTL_IN_MS = 10 * 60 * 1000;
/** 192 random bits for the one-time OAuth state. */
const STATE_BYTES = 24;
export const RECEIVING_PAGE = "/fornecedor/painel/recebimentos";

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
      if (supplier === null) {
        return null;
      }
      return { supplierId: supplier.id, slug: membership.slug };
    }),
  );
  return found.filter((profile) => profile !== null);
}

/** Back to the receiving page with a fixed outcome, on the supplier's own profile when known. */
function receivingPage(request: Request, outcome: MercadoPagoConnectOutcome, profileSlug?: string) {
  const url = new URL(RECEIVING_PAGE, appOriginFor(request.url));
  url.searchParams.set("mercadopago", outcome);
  if (profileSlug !== undefined) {
    url.searchParams.set("perfil", profileSlug);
  }
  return Response.redirect(url.toString(), 302);
}

function loginPage(request: Request) {
  const url = new URL("/login", appOriginFor(request.url));
  url.searchParams.set("redirect", RECEIVING_PAGE);
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
 * GET /api/integracoes/mercado-pago/conectar?fornecedor=<id>: a member of that supplier's
 * profile is sent to Mercado Pago's consent page with a one-time state.
 */
export async function handleMercadoPagoConnectStart(request: Request): Promise<Response> {
  const requester = await signedInRequester(request);
  if (requester === null) {
    return loginPage(request);
  }
  const settings = mercadoPagoSettings();
  if (settings === null) {
    return receivingPage(request, "indisponivel");
  }
  const query = mercadoPagoStartQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return receivingPage(request, "sem_permissao");
  }
  const supplierId = query.data.fornecedor;
  const refusal = paymentAccountLinkRefusal(
    {
      supplierIds: requester.profiles.map((profile) => profile.supplierId),
      impersonatedBy: requester.impersonatedBy,
    },
    supplierId,
  );
  if (refusal !== null) {
    return receivingPage(request, refusal);
  }
  const state = randomBytes(STATE_BYTES).toString("base64url");
  await createPaymentOAuthState(database, {
    state,
    supplierId,
    userId: requester.userId,
    provider: "mercado_pago",
    ttlMilliseconds: STATE_TTL_IN_MS,
  });
  const consentUrl = mercadoPagoAuthorizationUrl({
    settings,
    state,
    redirectUri: mercadoPagoRedirectUri(),
  });
  return Response.redirect(consentUrl, 302);
}

async function saveAccount(input: { supplierId: string; userId: string; code: string }) {
  const settings = mercadoPagoSettings();
  if (settings === null) {
    return "indisponivel" as const;
  }
  try {
    const tokens = await exchangeMercadoPagoCode(settings, {
      code: input.code,
      redirectUri: mercadoPagoRedirectUri(),
    });
    await upsertSupplierPaymentAccount(database, {
      supplierId: input.supplierId,
      provider: "mercado_pago",
      userId: input.userId,
      providerAccountId: tokens.accountId,
      tokens: {
        accessTokenEnc: tokenCipher.encrypt(tokens.accessToken),
        refreshTokenEnc: tokenCipher.encrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
      },
    });
    logger.info("mercado_pago.account_linked", { supplierId: input.supplierId });
    return "ligada" as const;
  } catch (error) {
    if (!isMercadoPagoError(error)) {
      throw error;
    }
    logger.warn("mercado_pago.link_failed", {
      supplierId: input.supplierId,
      status: error.status,
    });
    return "falhou" as const;
  }
}

/**
 * GET /api/integracoes/mercado-pago/retorno: the state must be this user's and fresh, and the
 * user must still be a member of that supplier's profile, before the code is traded for tokens.
 */
export async function handleMercadoPagoConnectCallback(request: Request): Promise<Response> {
  const requester = await signedInRequester(request);
  if (requester === null) {
    return loginPage(request);
  }
  const query = mercadoPagoCallbackQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return receivingPage(request, "resposta_invalida");
  }
  if ("error" in query.data) {
    return receivingPage(request, "cancelado");
  }
  const stateRecord = await consumePaymentOAuthState(database, {
    state: query.data.state,
    userId: requester.userId,
    provider: "mercado_pago",
  });
  if (stateRecord === null) {
    return receivingPage(request, "expirado");
  }
  const profile = requester.profiles.find((item) => item.supplierId === stateRecord.supplierId);
  const refusal = paymentAccountLinkRefusal(
    {
      supplierIds: requester.profiles.map((item) => item.supplierId),
      impersonatedBy: requester.impersonatedBy,
    },
    stateRecord.supplierId,
  );
  if (refusal !== null || profile === undefined) {
    return receivingPage(request, refusal ?? "sem_permissao");
  }
  const outcome = await saveAccount({
    supplierId: stateRecord.supplierId,
    userId: requester.userId,
    code: query.data.code,
  });
  return receivingPage(request, outcome, profile.slug);
}
