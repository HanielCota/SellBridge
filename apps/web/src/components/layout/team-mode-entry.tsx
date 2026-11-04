import { ShieldCheckIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { Hint } from "@/components/ui/hint";
import { teamEntryPage } from "@/features/auth/team-entry-page";
import { useTeamModeSwitch } from "@/features/auth/use-team-mode-switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { navTabClassName } from "./nav-tab-parts";
import { HEADER_ROUND_BUTTON_CLASSES } from "./support-button";

function useEnterTeamMode(role: string) {
  const navigate = useNavigate();
  const { name, switchTeamMode } = useTeamModeSwitch(role);

  async function enter(): Promise<void> {
    const switched = await switchTeamMode(true);
    if (!switched) {
      return;
    }
    try {
      await navigate({ to: teamEntryPage(role) });
    } catch (error) {
      // The mode is on, so the team tabs are there; only the page could not open.
      toast.error(`Não foi possível abrir a área da equipe: ${errorMessage(error)}`);
    }
  }

  return { name, enter, leave: async () => await switchTeamMode(false) };
}

/**
 * The team mode's switch, beside the bell: before it, the tools sat behind a switch inside the
 * account menu. Off, it turns the mode on and opens the team's area; on, it reads as pressed
 * and turns the mode off (a team page then goes back to the seller's home).
 */
export function TeamModeButton({ role, active }: { role: string; active: boolean }) {
  const { name, enter, leave } = useEnterTeamMode(role);
  return (
    <Hint
      label={active ? "Desliga o modo e volta ao painel" : "Liga o modo e abre a área da equipe"}
      openOnTap={false}
    >
      <button
        type="button"
        aria-label={name}
        aria-pressed={active}
        onClick={() => void (active ? leave() : enter())}
        className={cn(
          HEADER_ROUND_BUTTON_CLASSES,
          "transition-[background-color,scale] min-[1366px]:pr-4 min-[1366px]:pl-3.5",
          active
            ? "bg-brand text-primary-foreground hover:bg-brand/90"
            : "text-foreground ring-1 ring-border hover:bg-foreground/[0.06]",
        )}
      >
        <ShieldCheckIcon className="size-5" weight="fill" aria-hidden="true" />
        {/* Beside the support button the word squeezes the tab capsule below 1366px (measured at
            1280px: "Financeiro" was cut), so up to there the shield stands alone. */}
        <span className="hidden text-sm font-medium min-[1366px]:inline" aria-hidden="true">
          {name}
        </span>
      </button>
    </Hint>
  );
}

/** First row of the phone menu: outlined, so it never reads as the open tab. */
export function TeamModeMenuEntry({ role, onEnter }: { role: string; onEnter: () => void }) {
  const { name, enter } = useEnterTeamMode(role);
  return (
    <button
      type="button"
      onClick={() => {
        onEnter();
        void enter();
      }}
      className={cn(
        navTabClassName({ isActive: false, paintsOwnPill: false, padding: "px-4" }),
        "mb-2 font-medium text-foreground ring-1 ring-border",
      )}
    >
      <ShieldCheckIcon className="size-5 shrink-0" weight="fill" aria-hidden="true" />
      {name}
    </button>
  );
}
