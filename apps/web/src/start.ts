import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { serverErrorLogging } from "@/lib/server/error-logging";
import { tabProfileHeaders } from "@/lib/tab-profile";
import { bodyLimitFor, declaresMoreThan, payloadTooLarge } from "@/lib/server/request-body-limit";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * Headers for every response the app renders (review #13). The CSP only blocks framing: a
 * script policy would need nonces for the hydration scripts TanStack Start inlines.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": "frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function isHttps(request: Request): boolean {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

/** Pages opened by a secret token in the path: the supplier's order and the buyer's tracking. */
const SECRET_LINK_PREFIXES = ["/fornecedor/pedido/", "/rastreio/"];

const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  // Redirect responses have immutable headers, so the headers go on a copy.
  const response = new Response(result.response.body, result.response);
  if (response.headers.get("content-type")?.includes("text/html")) {
    response.headers.set("cache-control", "no-store");
  }
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  if (SECRET_LINK_PREFIXES.some((prefix) => new URL(request.url).pathname.startsWith(prefix))) {
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.set("x-robots-tag", "noindex, nofollow");
  }
  if (isHttps(request)) {
    response.headers.set(
      "strict-transport-security",
      `max-age=${ONE_YEAR_IN_SECONDS}; includeSubDomains`,
    );
  }
  return response;
});

/**
 * Refuses a server function or auth call whose declared body is over its cap before anything
 * parses it. A chunked body declares no length; server.ts counts those bytes as they arrive.
 */
const bodyLimitMiddleware = createMiddleware().server(async ({ next, request }) => {
  const limit = bodyLimitFor(new URL(request.url).pathname);
  if (limit !== null && declaresMoreThan(request, limit)) {
    return payloadTooLarge();
  }
  return next();
});

/** Every server call from the browser names the tab's profile (see lib/profile-param.ts). */
const tabProfileMiddleware = createMiddleware({ type: "function" }).client(async ({ next }) =>
  next({ headers: tabProfileHeaders() }),
);

export const startInstance = createStart(() => ({
  functionMiddleware: [tabProfileMiddleware, serverErrorLogging],
  requestMiddleware: [
    bodyLimitMiddleware,
    createCsrfMiddleware({ filter: (context) => context.handlerType === "serverFn" }),
    securityHeadersMiddleware,
  ],
}));
