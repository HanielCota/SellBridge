import { setResponseHeader } from "@tanstack/react-start/server";

/** A page opened by a secret link: never cached, indexed or leaked through the Referer. */
export function privateResponse(): void {
  setResponseHeader("Cache-Control", "no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}
