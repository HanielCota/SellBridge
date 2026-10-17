import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserSwitchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { getAppSession } from "@/features/auth/session.functions";

/**
 * Where a link to a profile outside the account lands (a link copied by someone else, or a
 * profile the user lost access to): an explanation and the way back, never an error page.
 */
export const Route = createFileRoute("/outro-perfil")({
  beforeLoad: async ({ location }) => {
    const session = await getAppSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  head: () => ({ meta: [{ title: "Outro perfil | SellBridge" }] }),
  component: OtherProfilePage,
});

function OtherProfilePage() {
  return (
    <main
      id="main-content"
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center"
    >
      <UserSwitchIcon className="size-8 text-muted-foreground" weight="light" aria-hidden="true" />
      <div className="max-w-sm space-y-1">
        <h1 className="text-subhead font-medium">Este link é de outro perfil</h1>
        <p className="text-sm text-muted-foreground">
          Ele abre um perfil que não está na sua conta.
        </p>
      </div>
      {/* A full page load, so nothing from the link's profile stays in this tab. */}
      <Button asChild>
        <a href="/dashboard">Ir para o meu perfil</a>
      </Button>
    </main>
  );
}
