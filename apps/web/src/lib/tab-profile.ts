import { useRouterState } from "@tanstack/react-router";
import { PROFILE_HEADER, PROFILE_SEARCH_PARAM, parseRequestedProfile } from "./profile-param.ts";

/**
 * The profile of this browser tab. The app layout records it before a navigation loads anything,
 * because while a navigation is pending `window.location` still shows the previous page.
 */
let rememberedProfile: string | null = null;

export function rememberTabProfile(slug: string): void {
  rememberedProfile = slug;
}

/** Forgets a profile the tab must not use, so the next calls fall back to the session's. */
export function forgetTabProfile(): void {
  rememberedProfile = null;
}

/** The tab's profile, or null on the server (a server render reads the page URL instead). */
export function tabProfile(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (rememberedProfile !== null) {
    return rememberedProfile;
  }
  const fromUrl = new URL(window.location.href).searchParams.get(PROFILE_SEARCH_PARAM);
  return parseRequestedProfile(fromUrl);
}

/** Headers for a `fetch` to an HTTP route that works on the tab's profile. */
export function tabProfileHeaders(): Record<string, string> {
  const slug = tabProfile();
  if (slug === null) {
    return {};
  }
  return { [PROFILE_HEADER]: slug };
}

/** `href` with `?perfil=` set to `slug` (kept as it is when there is no profile). */
export function addProfileToHref(href: string, slug: string | null): string {
  if (slug === null) {
    return href;
  }
  const url = new URL(href, "http://localhost");
  url.searchParams.set(PROFILE_SEARCH_PARAM, slug);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `href` without `?perfil=`. */
export function removeProfileFromHref(href: string): string {
  const url = new URL(href, "http://localhost");
  url.searchParams.delete(PROFILE_SEARCH_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * A link to an HTTP route (download, OAuth) opened by the browser itself, which sends no header.
 * Read from the page URL, so the server render and the browser draw the same link.
 */
export function useTabProfileLink(): (href: string) => string {
  const slug = useRouterState({
    select: (state) => parseRequestedProfile(searchValue(state.location.search)),
  });
  return (href) => addProfileToHref(href, slug);
}

function searchValue(search: Record<string, unknown>): string | null {
  const value = search[PROFILE_SEARCH_PARAM];
  return typeof value === "string" ? value : null;
}
