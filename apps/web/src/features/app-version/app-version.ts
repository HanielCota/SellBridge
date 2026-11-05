import { z } from "zod";

/** The build this page loaded, baked in by Vite (the deploy's commit). */
export const PAGE_BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? "development";

/** How often an open page asks which build the server runs. */
export const VERSION_CHECK_INTERVAL_IN_MS = 5 * 60 * 1000;

/** A version check that hangs is dropped: the next one comes in a few minutes anyway. */
export const VERSION_CHECK_TIMEOUT_IN_MS = 10_000;

const servedVersionSchema = z.object({ buildId: z.string().regex(/^[\w.-]{1,100}$/) });

/**
 * The build id in the server's `/api/version` answer, or null when the answer is not one (a
 * proxy error page, a half-deployed server): an unreadable answer must never ask for a reload.
 */
export function servedBuildId(body: unknown): string | null {
  const parsed = servedVersionSchema.safeParse(body);
  return parsed.success ? parsed.data.buildId : null;
}

/** Whether the server already runs another build than the page, so the page is out of date. */
export function isOutdatedPage(pageBuildId: string, served: string | null): boolean {
  return served !== null && served !== pageBuildId;
}
