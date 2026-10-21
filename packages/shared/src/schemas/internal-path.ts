import { z } from "zod";
import { optionalParameter } from "./fallback.ts";

/** A stand-in origin: a path is internal when resolving it against any origin keeps that origin. */
const PROBE_ORIGIN = "https://sellbridge.invalid";

/**
 * Backslashes (browsers read `/\host` as `//host`), whitespace and control characters (browsers
 * strip tabs and newlines, so `/\t/host` turns into `//host`) never belong in a path we send to.
 */
const UNSAFE_CHARACTERS = /[\\\s\p{Cc}]/u;

function isInternalPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return false;
  }
  if (UNSAFE_CHARACTERS.test(value)) {
    return false;
  }
  return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
}

/**
 * Where to send someone after they sign in or finish a step: a path on this site only. Anything
 * else is dropped, so the page falls back to its own destination instead of failing.
 */
export const internalPathSchema = optionalParameter(z.string().refine(isInternalPath));
