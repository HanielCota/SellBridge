import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAppSession } from "@/features/auth/session.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getAppSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    throw redirect({ to: "/dashboard" });
  },
});
