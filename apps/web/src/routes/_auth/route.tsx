import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/auth-shell";
import { getAppSession, getSignInOptions } from "@/features/auth/session.functions";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    const session = await getAppSession();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: () => getSignInOptions(),
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <AuthShell>
      <Outlet />
    </AuthShell>
  );
}
