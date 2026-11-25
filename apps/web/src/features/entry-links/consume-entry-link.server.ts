import {
  consumeDeveloperEntryLink,
  type EntryLinkConsumption,
  recordDeveloperApiRequest,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  ENTRY_CHOICE_COOKIE,
  ENTRY_CHOICE_LIFETIME_MINUTES,
  entryLinkTokenSchema,
  generateEntryChoiceSecret,
  hashEntryLinkToken,
} from "@/features/developer-api/entry-link-token.server";
import { database } from "@/lib/server/database";

/** What the landing page says when the click did not hand over a choice. */
export type EntryLinkSituation = "invalido" | "vencido" | "usado";

type RefusedKind = Exclude<EntryLinkConsumption["kind"], "consumed">;

const SITUATION_BY_KIND: Record<RefusedKind, EntryLinkSituation> = {
  not_found: "invalido",
  expired: "vencido",
  used: "usado",
};

/** The status the click is recorded with in the key's usage trail. */
const TRAIL_STATUS_BY_KIND: Record<EntryLinkConsumption["kind"], number> = {
  consumed: 200,
  not_found: 404,
  expired: 410,
  used: 409,
};

/** The token must not stay cached or leak to another site as a referrer. */
const PRIVATE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const SECONDS_PER_MINUTE = 60;

function choiceCookie(secret: string, secure: boolean): string {
  const attributes = [
    `${ENTRY_CHOICE_COOKIE}=${secret}`,
    "Path=/",
    `Max-Age=${ENTRY_CHOICE_LIFETIME_MINUTES * SECONDS_PER_MINUTE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  return (secure ? [...attributes, "Secure"] : attributes).join("; ");
}

/** 303 to a fixed internal page: the token leaves the address bar and the history entry. */
function redirectTo(location: string, cookie: string | null): Response {
  const headers = new Headers({ ...PRIVATE_HEADERS, location });
  if (cookie !== null) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status: 303, headers });
}

async function recordClick(consumption: EntryLinkConsumption): Promise<void> {
  if (consumption.kind === "not_found") {
    return;
  }
  try {
    await recordDeveloperApiRequest(database, {
      developerApiKeyId: consumption.issuer.keyId,
      keyPrefix: consumption.issuer.keyPrefix,
      operation: "openEntryLink",
      status: TRAIL_STATUS_BY_KIND[consumption.kind],
      durationMilliseconds: 0,
      organizationId: null,
      resourceId: consumption.issuer.linkId,
      personalData: false,
    });
  } catch (error) {
    logger.error("entry_link.click_not_recorded", { error });
  }
}

/**
 * The first click on an entry link, signed in or not: spends the token, keeps the choice in an
 * httpOnly cookie and sends the person to `/entrar`. Sign-in or sign-up happens there, and the
 * choice is claimed after it.
 */
export async function consumeEntryLinkClick(
  input: { token: string; secureCookie: boolean },
  now: Date,
): Promise<Response> {
  const token = entryLinkTokenSchema.safeParse(input.token);
  if (!token.success) {
    return redirectTo("/entrar?situacao=invalido", null);
  }
  const choice = generateEntryChoiceSecret();
  const consumption = await consumeDeveloperEntryLink(database, {
    tokenHash: hashEntryLinkToken(token.data),
    choiceHash: choice.secretHash,
    now,
  });
  await recordClick(consumption);
  if (consumption.kind === "consumed") {
    return redirectTo("/entrar", choiceCookie(choice.secret, input.secureCookie));
  }
  return redirectTo(`/entrar?situacao=${SITUATION_BY_KIND[consumption.kind]}`, null);
}
