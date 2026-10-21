import { z } from "zod";

/**
 * Each browser tab works on its own profile (organization). The profile lives in the page URL
 * (`?perfil=<slug>`) and travels with every server call as a header, so switching profile in one
 * tab never moves another tab: the session's active organization is only the default for new tabs.
 */
export const PROFILE_HEADER = "x-sellbridge-profile";
export const PROFILE_SEARCH_PARAM = "perfil";

const MAX_SLUG_LENGTH = 80;

/** Organization slugs are lowercase letters, digits and dashes (see `slugify` in auth.ts). */
export const profileSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SLUG_LENGTH)
  .regex(/^[a-z0-9-]+$/);

/**
 * The slug a request asks for, or null when it asks for none. A malformed value is kept (cut to
 * one past the slug length) so the server refuses it by name instead of quietly serving the default.
 */
export function parseRequestedProfile(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = profileSlugSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  return value.trim().slice(0, MAX_SLUG_LENGTH + 1);
}

/** The profile from the tab's header. */
export function profileHeaderOf(headers: Headers): string | null {
  return parseRequestedProfile(headers.get(PROFILE_HEADER));
}

/** The profile a request asks for: the tab's header first, then `?perfil=` in its URL. */
export function requestedProfileOf(request: { headers: Headers; url: string }): string | null {
  const fromHeader = profileHeaderOf(request.headers);
  if (fromHeader !== null) {
    return fromHeader;
  }
  return parseRequestedProfile(new URL(request.url).searchParams.get(PROFILE_SEARCH_PARAM));
}
