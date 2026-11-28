import {
  consumeDeveloperEntryLink,
  type EntryLinkConsumption,
  findDeveloperEntryLinkState,
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

const CONFIRMATION_PAGE = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Abrir seleção de produtos | SellBridge</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <style>
      @font-face { font-family: "Manrope Variable"; font-style: normal; font-display: swap;
        font-weight: 200 800; src: url("/fonts/manrope-latin-wght-normal.woff2") format("woff2"); }
      :root { color-scheme: light dark; --background: oklch(0.97 0.002 260);
        --foreground: oklch(0.145 0 0); --muted: oklch(0.47 0.008 260);
        --primary: oklch(0.74 0.19 153);
        --primary-foreground: oklch(0.2 0.015 250); --focus: oklch(0.5 0.13 152); }
      @media (prefers-color-scheme: dark) {
        :root { --background: oklch(0.165 0.003 260); --foreground: oklch(0.93 0 0); --muted: oklch(0.72 0.005 260);
          --primary: oklch(0.8 0.15 152);
          --primary-foreground: oklch(0.18 0.02 160); --focus: oklch(0.87 0.16 152); } }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100svh; display: flex; flex-direction: column;
        background: var(--background); color: var(--foreground);
        font-family: "Manrope Variable", "Manrope", system-ui, sans-serif; line-height: 1.5;
        -webkit-font-smoothing: antialiased; }
      main { flex: 1; display: flex; flex-direction: column; align-items: center;
        justify-content: center; padding: 2rem 1.25rem 5rem; }
      .frame { width: 100%; max-width: 380px; display: flex; flex-direction: column;
        align-items: center; }
      .logo { display: block; height: 40px; width: auto; margin-bottom: 1.75rem; }
      .content { width: 100%; text-align: center; }
      h1 { margin: 0 0 .5rem; font-size: 1.375rem; line-height: 1.25; font-weight: 700;
        letter-spacing: -0.01em; }
      p { margin: 0 0 1.5rem; color: var(--muted); }
      button { width: 100%; min-height: 50px; padding: .625rem 1rem; font: inherit;
        font-weight: 600; cursor: pointer; color: var(--primary-foreground);
        background: var(--primary); border: 0; border-radius: 999px; }
      button:hover { filter: brightness(0.96); }
      button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
      footer { padding: 1.25rem 1rem; text-align: center; font-size: .75rem; color: var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <div class="frame">
        <picture>
          <source srcset="/brand/sellbridge-logo-dark.svg" media="(prefers-color-scheme: dark)">
          <img class="logo" src="/brand/sellbridge-logo-light.svg" alt="SellBridge" width="160" height="40">
        </picture>
        <div class="content">
          <h1>Abrir seleção de produtos</h1>
          <p>Continue para ver os produtos que você escolheu no SellBridge.</p>
          <form method="post">
            <button type="submit">Abrir seleção</button>
          </form>
        </div>
      </div>
    </main>
    <footer>© ${new Date().getFullYear()} SellBridge</footer>
  </body>
</html>`;

/**
 * Previews can load this page without changing or revealing the selection. A link that can no
 * longer be confirmed says so right away instead of offering a button that would only fail.
 */
export async function entryLinkConfirmation(token: string, now: Date): Promise<Response> {
  const parsed = entryLinkTokenSchema.safeParse(token);
  if (!parsed.success) {
    return redirectTo("/entrar?situacao=invalido", null);
  }
  const state = await findDeveloperEntryLinkState(database, {
    tokenHash: hashEntryLinkToken(parsed.data),
    now,
  });
  if (state !== "open") {
    return redirectTo(`/entrar?situacao=${SITUATION_BY_KIND[state]}`, null);
  }
  return new Response(CONFIRMATION_PAGE, {
    headers: {
      ...PRIVATE_HEADERS,
      "referrer-policy": "origin",
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; img-src 'self'; font-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}

export function confirmEntryLink(
  input: { request: Request; token: string; appOrigin: string },
  now: Date,
): Promise<Response> | Response {
  const { request, token, appOrigin } = input;
  if (request.headers.get("origin") !== appOrigin) {
    return new Response("Abra o link novamente e confirme na página do SellBridge.", {
      status: 403,
      headers: { ...PRIVATE_HEADERS, "content-type": "text/plain; charset=utf-8" },
    });
  }
  return consumeEntryLinkClick({ token, secureCookie: appOrigin.startsWith("https:") }, now);
}

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
 * Confirmation of an entry link, signed in or not: spends the token, keeps the choice in an
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
