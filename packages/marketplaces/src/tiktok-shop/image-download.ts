import { get as httpsGet } from "node:https";
import { isIPv6, type LookupFunction } from "node:net";
import { isNonPublicAddress } from "@sellbridge/shared/network-address";
import { marketplaceError } from "../errors.ts";
import type { ResolveHost } from "./client.ts";

/** A product photo as the supplier's host answered it. */
export interface DownloadedImage {
  readonly status: number;
  readonly contentType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** Fetches one photo; injected in tests, which have no network. */
export type DownloadImage = (url: URL) => Promise<DownloadedImage>;

/** Upload Product Image refuses files above 10 MB. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** The whole exchange (DNS, connect, headers and body), so a host trickling bytes cannot hold it. */
const DOWNLOAD_DEADLINE_MILLISECONDS = 30_000;

/** The photo's host resolved to a private, loopback or otherwise non-public address. */
export class NonPublicImageAddressError extends Error {
  constructor(hostname: string) {
    super(`${hostname} resolved to a non-public network address`);
    this.name = "NonPublicImageAddressError";
  }
}

function refusedAddressError(hostname: string): Error {
  return new NonPublicImageAddressError(hostname);
}

function familyOf(address: string): 4 | 6 {
  return isIPv6(address) ? 6 : 4;
}

/**
 * DNS lookup that refuses non-public addresses when the socket connects. Checking the URL first
 * and letting the HTTP client resolve again would allow DNS rebinding: a host that answers with a
 * public address to the check and with 127.0.0.1 to the connection.
 */
export function publicOnlyLookup(resolveHost: ResolveHost): LookupFunction {
  return (hostname, options, deliver) => {
    void (async () => {
      try {
        const addresses = await resolveHost(hostname);
        const [first] = addresses;
        if (first === undefined || addresses.some((address) => isNonPublicAddress(address))) {
          throw refusedAddressError(hostname);
        }
        if (options.all) {
          deliver(
            null,
            addresses.map((address) => ({ address, family: familyOf(address) })),
          );
          return;
        }
        deliver(null, first, familyOf(first));
      } catch (error) {
        deliver(error instanceof Error ? error : refusedAddressError(hostname), "", 0);
      }
    })();
  };
}

function tooLargeError(): Error {
  return marketplaceError("A foto do produto passa de 10 MB, o limite do TikTok Shop", {
    retryable: false,
  });
}

/**
 * GET over node:https so the connection goes through `publicOnlyLookup`. Redirects are not
 * followed (the caller treats a 3xx as a failure) and a pooled socket is never reused, since it
 * would skip the lookup and with it the address check.
 */
export function downloadPublicImage(resolveHost: ResolveHost): DownloadImage {
  return async (url) =>
    new Promise<DownloadedImage>((resolve, reject) => {
      const request = httpsGet(
        url,
        {
          lookup: publicOnlyLookup(resolveHost),
          agent: false,
          signal: AbortSignal.timeout(DOWNLOAD_DEADLINE_MILLISECONDS),
        },
        (response) => {
          const chunks: Buffer[] = [];
          let received = 0;
          response.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_IMAGE_BYTES) {
              response.destroy(tooLargeError());
              return;
            }
            chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              contentType: response.headers["content-type"] ?? "",
              bytes: new Uint8Array(Buffer.concat(chunks)),
            });
          });
        },
      );
      request.on("error", reject);
    });
}
