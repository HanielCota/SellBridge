import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserSwitchIcon } from "@phosphor-icons/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getAppSession } from "@/features/auth/session.functions";

const perfilSchema = z.string().max(80);

function validateSearch(search: Record<string, unknown>): { perfil?: string } {
  const parsed = perfilSchema.safeParse(search.perfil);
  return parsed.success ? { perfil: parsed.data } : {};
}

/**
 * Where a link to a profile outside the account lands (a link copied by someone else, or a
 * profile the user lost access to): an explanation and the way back, never an error page.
 */
export const Route = createFileRoute("/outro-perfil")({
  validateSearch,
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
  const { perfil } = Route.useSearch();
  return (
    <main
      id="main-content"
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-center"
    >
      <UserSwitchIcon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Este link é de outro perfil</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {perfil === undefined
          ? "O perfil deste link não está na sua conta."
          : `O perfil “${perfil}” não está na sua conta, ou você não tem mais acesso a ele.`}
      </p>
      {/* A full page load, so nothing from the link's profile stays in this tab. */}
      <Button asChild>
        <a href="/dashboard">Ir para o meu perfil</a>
      </Button>
    </main>
  );
}
