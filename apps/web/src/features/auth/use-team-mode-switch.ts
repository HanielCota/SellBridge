import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { setAdminMode } from "@/features/auth/session.functions";
import { forgetAppSession } from "@/features/auth/session.queries";
import { teamModeName } from "@/features/auth/team-mode";

/**
 * Shows or hides the team tools. Switching off on a team page goes back to the seller's home, as
 * the team pages are no longer open; the answer says whether the switch took.
 */
export function useTeamModeSwitch(role: string) {
  const name = teamModeName(role);
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnAdminPage = useRouterState({
    select: (state) => state.location.pathname.startsWith("/admin"),
  });

  async function switchTeamMode(next: boolean): Promise<boolean> {
    try {
      await setAdminMode({ data: { enabled: next } });
    } catch {
      toast.error(`Não foi possível alterar o ${name.toLowerCase()}.`);
      return false;
    }
    // Before the navigation below, which would still see the team mode as it was.
    forgetAppSession(queryClient);
    toast.success(next ? `${name} ativado` : `${name} desativado`);
    if (!next && isOnAdminPage) {
      await navigate({ to: "/dashboard" });
    }
    await router.invalidate();
    return true;
  }

  return { name, switchTeamMode };
}
