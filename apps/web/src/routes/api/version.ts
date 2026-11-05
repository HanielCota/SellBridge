import { createFileRoute } from "@tanstack/react-router";
import { PAGE_BUILD } from "@/features/app-version/app-version";

/**
 * The build the server runs (the same bundle the page got). Open pages compare it with the
 * build they loaded and offer a reload when a newer deploy replaced it; never cached, or a
 * stale answer would hide the deploy.
 */
function handleVersion(): Response {
  return Response.json(PAGE_BUILD, { headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/version")({
  server: { handlers: { GET: handleVersion } },
});
