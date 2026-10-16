import { lookup } from "node:dns/promises";
import { withDeadline } from "@sellbridge/shared/deadline";
import { validationError } from "@sellbridge/shared/errors";
import { hostnameWithoutBrackets, isNonPublicAddress } from "@sellbridge/shared/network-address";

/** Every address a host name resolves to (A and AAAA). */
export type ResolveHost = (hostname: string) => Promise<string[]>;

/**
 * A lookup runs on libuv's 4-thread pool with no timeout of its own: a receiver whose name
 * servers stall could hold a delivery batch past its 2-minute lease (and be sent twice) and slow
 * every other lookup in the worker. The guard gives up after this long.
 */
const LOOKUP_DEADLINE_MILLISECONDS = 5_000;

export const resolveHostWithDns: ResolveHost = async (hostname) => {
  const addresses = await withDeadline(
    lookup(hostname, { all: true, verbatim: true }),
    LOOKUP_DEADLINE_MILLISECONDS,
    "Resolução de DNS do webhook",
  );
  return addresses.map((entry) => entry.address);
};

/**
 * Refuses webhook URLs that would make the worker call internal services (SSRF): non-HTTP
 * schemes and hosts resolving to any non-public address. All resolved addresses must be
 * public, otherwise a host with one public and one private record could still reach inside.
 * `allowPrivate` exists for local development, where receivers run on localhost.
 */
export async function assertDeliverableWebhookUrl(
  url: string,
  options: { allowPrivate: boolean; resolveHost: ResolveHost },
): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw validationError("URL de webhook precisa ser http ou https");
  }
  if (options.allowPrivate) {
    return;
  }
  const addresses = await options.resolveHost(hostnameWithoutBrackets(parsed.hostname));
  if (addresses.length === 0 || addresses.some((address) => isNonPublicAddress(address))) {
    throw validationError("URL de webhook aponta para um endereço de rede não público");
  }
}
