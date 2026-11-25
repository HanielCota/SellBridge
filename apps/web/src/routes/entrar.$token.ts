import { createFileRoute } from "@tanstack/react-router";
import { consumeEntryLinkClick } from "@/features/entry-links/consume-entry-link.server";
import { environment } from "@/lib/server/environment";

/** The link another project hands out: spent on the first click, signed in or not. */
export const Route = createFileRoute("/entrar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        consumeEntryLinkClick(
          { token: params.token, secureCookie: environment.APP_URL.startsWith("https:") },
          new Date(),
        ),
    },
  },
});
