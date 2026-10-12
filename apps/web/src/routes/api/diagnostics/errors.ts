import { createFileRoute } from "@tanstack/react-router";
import { handleErrorReport } from "@/lib/server/error-reports";

export const Route = createFileRoute("/api/diagnostics/errors")({
  server: { handlers: { POST: ({ request }) => handleErrorReport(request) } },
});
