import { createServerFn } from "@tanstack/react-start";
import { accountMiddleware } from "@/lib/server/middleware";
import { loadAccountSetupNotice } from "./account-setup.server";

/** The header notice: the most important setup item the tab's profile still has to finish. */
export const ownAccountSetupNotice = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => await loadAccountSetupNotice(context));
