import {
  SIGN_UP_PROFILE_COOKIE,
  SIGN_UP_PROFILE_COOKIE_SECONDS,
  signUpProfileKindSchema,
} from "@sellbridge/shared/sign-up-profile";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { environment } from "@/lib/server/environment";
import { publicMiddleware } from "@/lib/server/middleware";

/**
 * Remembers the sign-up choice for the few minutes of a Google redirect: the account is created
 * on the OAuth callback, which has no form body (see `createProfileForNewUser`). Choosing to sell
 * clears it, so an abandoned supplier attempt never leaks into a later sign-up.
 */
export const rememberSignUpProfileFn = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .validator(z.object({ kind: signUpProfileKindSchema }))
  .handler(async ({ data }) => {
    if (data.kind === "seller") {
      deleteCookie(SIGN_UP_PROFILE_COOKIE, { path: "/" });
      return { kind: data.kind };
    }
    setCookie(SIGN_UP_PROFILE_COOKIE, data.kind, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: environment.NODE_ENV === "production",
      maxAge: SIGN_UP_PROFILE_COOKIE_SECONDS,
    });
    return { kind: data.kind };
  });
