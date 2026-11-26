import { createFileRoute } from "@tanstack/react-router";
import {
  confirmEntryLink,
  entryLinkConfirmation,
} from "@/features/entry-links/consume-entry-link.server";
import { appOriginFor } from "@/lib/server/app-origin";

/** The link another project hands out: spent on confirmation, signed in or not. */
export const Route = createFileRoute("/entrar/$token")({
  server: {
    handlers: {
      GET: ({ params }) => entryLinkConfirmation(params.token),
      POST: async ({ request, params }) =>
        confirmEntryLink(
          { request, token: params.token, appOrigin: appOriginFor(request.url) },
          new Date(),
        ),
    },
  },
});
