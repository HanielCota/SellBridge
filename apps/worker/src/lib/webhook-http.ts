import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { isNonPublicAddress } from "@sellbridge/shared/network-address";

export interface WebhookRequest {
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
  timeoutMilliseconds: number;
  allowPrivateUrls: boolean;
}

/** Sends one webhook and resolves with the HTTP status; network failures reject. */
export type SendWebhookRequest = (request: WebhookRequest) => Promise<number>;

function refusedAddressError(hostname: string): Error {
  return new Error(`${hostname} resolveu para um endereço de rede não público`);
}

async function publicAddresses(
  hostname: string,
  allowPrivateUrls: boolean,
): Promise<LookupAddress[]> {
  const addresses = await lookup(hostname, { all: true });
  const blocked = addresses.some((entry) => isNonPublicAddress(entry.address));
  if (addresses.length === 0 || (blocked && !allowPrivateUrls)) {
    throw refusedAddressError(hostname);
  }
  return addresses;
}

/**
 * DNS lookup that refuses non-public addresses at connection time. Checking the URL first and
 * letting the HTTP client resolve again would allow DNS rebinding: a host that answers with a
 * public address to the check and with 127.0.0.1 to the connection.
 */
export function publicOnlyLookup(allowPrivateUrls: boolean): LookupFunction {
  return (hostname, options, deliver) => {
    void (async () => {
      try {
        const addresses = await publicAddresses(hostname, allowPrivateUrls);
        const [first] = addresses;
        if (options.all || !first) {
          deliver(null, addresses);
          return;
        }
        deliver(null, first.address, first.family);
      } catch (error) {
        deliver(error instanceof Error ? error : refusedAddressError(hostname), "", 0);
      }
    })();
  };
}

/**
 * POST with node:http(s) so every connection goes through `publicOnlyLookup`. Redirects are
 * not followed (a 3xx counts as a failure) and the response body is discarded. The deadline
 * covers the whole exchange (DNS, connect, headers): the socket `timeout` alone only fires on
 * silence, so a receiver trickling a byte every few seconds would hold the request forever.
 */
export const sendWebhookRequest: SendWebhookRequest = async (webhook) => {
  const url = new URL(webhook.url);
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<number>((resolve, reject) => {
    const outgoing = send(
      url,
      {
        method: "POST",
        headers: { ...webhook.headers, "content-length": String(Buffer.byteLength(webhook.body)) },
        lookup: publicOnlyLookup(webhook.allowPrivateUrls),
        // A pooled keep-alive socket would skip the lookup, and with it the address check.
        agent: false,
      },
      (response) => {
        clearTimeout(deadline);
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    const deadline = setTimeout(() => {
      outgoing.destroy(new Error(`Sem resposta em ${webhook.timeoutMilliseconds} ms`));
    }, webhook.timeoutMilliseconds);
    outgoing.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    outgoing.end(webhook.body);
  });
};
