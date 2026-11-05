import { createFileRoute } from "@tanstack/react-router";
import { BUILD_ID } from "@/features/app-version/app-version";

/**
 * The build the server runs. Open pages compare it with the build they loaded and offer a
 * reload when a deploy replaced it; never cached, or a stale answer would hide the deploy.
 */
function handleVersion(): Response {
  return Response.json({ buildId: BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/version")({
  server: { handlers: { GET: handleVersion } },
});
