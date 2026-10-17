import { environment } from "./environment.ts";

interface AppOriginInput {
  requestUrl: string;
  appUrl: string;
  trustedOrigins: readonly string[];
}

/**
 * The origin our own redirects should stay on: the one the request came in on when it is the
 * app URL or a trusted origin, else the app URL. The session cookie only exists on the host the
 * person signed in on, so jumping to APP_URL from another trusted host lands on the login page.
 * Untrusted hosts (a forged Host header, an internal proxy address) never leak into a redirect.
 */
export function pickAppOrigin(input: AppOriginInput): string {
  const appOrigin = new URL(input.appUrl).origin;
  const requestOrigin = new URL(input.requestUrl).origin;
  if (requestOrigin === appOrigin) {
    return appOrigin;
  }
  return input.trustedOrigins.includes(requestOrigin) ? requestOrigin : appOrigin;
}

export function appOriginFor(requestUrl: string): string {
  return pickAppOrigin({
    requestUrl,
    appUrl: environment.APP_URL,
    trustedOrigins: environment.BETTER_AUTH_TRUSTED_ORIGINS,
  });
}
