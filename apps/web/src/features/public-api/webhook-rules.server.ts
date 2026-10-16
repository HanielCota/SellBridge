import { randomBytes } from "node:crypto";
import { validationError } from "@sellbridge/shared/errors";
import { hostnameWithoutBrackets, isNonPublicAddress } from "@sellbridge/shared/network-address";

/** Recognizable by secret scanners, like Stripe's: integrators know what it is at a glance. */
export const WEBHOOK_SECRET_PREFIX = "whsec_";

/** 32 random bytes; stored encrypted because the worker needs it back to sign requests. */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

const LOCAL_HOST_SUFFIXES = [".localhost", ".local", ".internal"];

/**
 * Early, friendly rejection of URLs the worker would refuse anyway. Host names are only
 * resolved by the worker, right before each request (see apps/worker/src/lib/webhook-url-guard.ts):
 * DNS can change after the endpoint is saved.
 */
export function assertAcceptableWebhookUrl(url: string, allowPrivate: boolean): void {
  if (allowPrivate) {
    return;
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw validationError("A URL do webhook precisa usar https");
  }
  const hostname = hostnameWithoutBrackets(parsed.hostname).toLowerCase();
  // A name with no dot ("postgres", "redis") only resolves inside a private network: refused
  // here, so the delivery error can never tell which internal names exist.
  const isSingleLabel = !hostname.includes(".") && !hostname.includes(":");
  const isLocalName =
    isSingleLabel ||
    hostname === "localhost" ||
    LOCAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  if (isLocalName || isNonPublicAddress(hostname)) {
    throw validationError("A URL do webhook precisa apontar para um endereço público da internet");
  }
}
