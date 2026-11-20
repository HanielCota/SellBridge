import { getIP } from "better-auth/api";

/**
 * Where the visitor's address comes from, for the login limit and every other per-client limit.
 *
 * Proxy assumption (see docs/decisions/2026-11-19-ip-de-quem-acessa.md): production has exactly
 * one proxy in front of the app, Coolify's Traefik, with DNS pointing straight at the server and
 * no port of the app open to the internet. The header must then carry a single address, the one
 * the proxy saw; a header with several entries carries some the visitor wrote, so it counts as no
 * address at all. Behind the Cloudflare proxy, `CLIENT_IP_HEADER` must be `cf-connecting-ip`.
 */
export function clientIpAddressOptions(headerName: string) {
  return { ipAddressHeaders: [headerName] };
}

/** The visitor's address under the rule above, as Better Auth reads it; null when untrusted. */
export function clientAddress(request: Request, headerName: string): string | null {
  return getIP(request, { advanced: { ipAddress: clientIpAddressOptions(headerName) } });
}
