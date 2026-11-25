import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { developerMiddleware } from "@/lib/server/middleware";
import { findDeveloperUserId } from "./developer-session.server";
import { createDeveloperKeyInputSchema } from "./developer-keys";
import {
  issueDeveloperKey,
  listOwnDeveloperKeys,
  revokeOwnDeveloperKey,
} from "./developer-keys.server";

/** Whether the hidden page exists for this session; never says why not. */
export const getDeveloperAccess = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await findDeveloperUserId(getRequestHeaders());
  return { allowed: userId !== null };
});

/** The developer's own keys, revoked and expired ones included; secrets are never returned. */
export const getDeveloperKeys = createServerFn({ method: "GET" })
  .middleware([developerMiddleware])
  .handler(async ({ context }) => listOwnDeveloperKeys(context.userId, new Date()));

/** Creates a key and returns its secret this one time. */
export const createDeveloperKeyFn = createServerFn({ method: "POST" })
  .middleware([developerMiddleware])
  .validator(createDeveloperKeyInputSchema)
  .handler(async ({ context, data }) =>
    issueDeveloperKey({ userId: context.userId, request: data, now: new Date() }),
  );

export const revokeDeveloperKeyFn = createServerFn({ method: "POST" })
  .middleware([developerMiddleware])
  .validator(z.object({ developerApiKeyId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await revokeOwnDeveloperKey({
      userId: context.userId,
      developerApiKeyId: data.developerApiKeyId,
      now: new Date(),
    });
    return { ok: true };
  });
