import { z } from "zod";

/**
 * The build this bundle came from, baked in by Vite (the deploy's commit). The server answers
 * it on `/api/version` and an open page compares it with its own.
 */
export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? "development";

/** When this bundle was built (ISO 8601, UTC), baked in by Vite next to the build id. */
export const BUILT_AT: string = import.meta.env.VITE_BUILT_AT ?? "1970-01-01T00:00:00.000Z";

/** How often an open page asks which build the server runs. */
export const VERSION_CHECK_INTERVAL_IN_MS = 5 * 60 * 1000;

/** A version check that hangs is dropped: the next one comes in a few minutes anyway. */
export const VERSION_CHECK_TIMEOUT_IN_MS = 10_000;

/** Window event that asks an open page to check the server's build right away. */
export const VERSION_CHECK_REQUEST_EVENT = "sellbridge:version-check";

/** A deploy's build id is a commit hash or a UUID; anything longer is not one. */
const MAX_BUILD_ID_LENGTH = 100;

const servedVersionSchema = z.object({
  buildId: z
    .string()
    .max(MAX_BUILD_ID_LENGTH)
    .regex(/^[\w.-]+$/),
  builtAt: z.iso.datetime(),
});

/** A build and when it was made, as the server answers it on `/api/version`. */
export type BuildStamp = z.infer<typeof servedVersionSchema>;

/** The build this page loaded. */
export const PAGE_BUILD: BuildStamp = { buildId: BUILD_ID, builtAt: BUILT_AT };

/**
 * The build in the server's `/api/version` answer, or null when the answer is not one (a proxy
 * error page, a half-deployed server): an unreadable answer must never ask for a reload.
 */
export function servedBuild(body: unknown): BuildStamp | null {
  const parsed = servedVersionSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * Whether the server already runs a newer build than the page, so the page is out of date. An
 * older build is not news: during a rolling deploy a new page can still reach the old server.
 */
export function isOutdatedPage(page: BuildStamp, served: BuildStamp | null): boolean {
  if (served === null || served.buildId === page.buildId) {
    return false;
  }
  return Date.parse(served.builtAt) > Date.parse(page.builtAt);
}

/** Asks the open page to check the server's build now, for example after a server call failed. */
export function requestVersionCheck(): void {
  window.dispatchEvent(new Event(VERSION_CHECK_REQUEST_EVENT));
}
