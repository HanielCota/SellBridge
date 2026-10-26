import { ShieldCheckIcon } from "@phosphor-icons/react";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useNavigate } from "@tanstack/react-router";
import { Hint } from "@/components/ui/hint";
import { teamHomeFor } from "@/features/auth/team-mode";
import { useTeamModeSwitch } from "@/features/auth/use-team-mode-switch";
import { ADMIN_NAV_ITEMS } from "@/features/navigation/nav-items";
import { cn } from "@/lib/utils";
import { navTabClassName } from "./nav-tab-parts";

/** Where switching the mode on lands: the first team page the role may open. */
function firstTeamPage(role: string): (typeof ADMIN_NAV_ITEMS)[number]["to"] {
  const page = ADMIN_NAV_ITEMS.find(
    (item) => item.permission === undefined || hasStaffPermission(role, item.permission),
  );
  if (page === undefined) {
    throw new Error(`No team page is open to the role "${role}"`);
  }
  return page.to;
}

/**
 * Where the team's way in lands: the same page signing in opens for agents and supervisors (the
 * ticket queue), else the first team page the role may open.
 */
export function teamEntryPage(role: string): (typeof ADMIN_NAV_ITEMS)[number]["to"] {
  return teamHomeFor(role, true) ?? firstTeamPage(role);
}

function useEnterTeamMode(role: string) {
  const navigate = useNavigate();
  const { name, switchTeamMode } = useTeamModeSwitch(role);

  async function enter(): Promise<void> {
    const switched = await switchTeamMode(true);
    if (!switched) {
      return;
    }
    await navigate({ to: teamEntryPage(role) });
  }

  return { name, enter };
}

/**
 * The team's way in, beside the bell: before it, the tools sat behind a switch inside the
 * account menu. It leaves once the mode is on; the account chip then says so.
 */
export function TeamModeButton({ role }: { role: string }) {
  const { name, enter } = useEnterTeamMode(role);
  return (
    <Hint label="Liga o modo e abre a área da equipe" openOnTap={false}>
      <button
        type="button"
        aria-label={name}
        onClick={() => void enter()}
        className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-card text-foreground ring-1 ring-border transition-[background-color,scale] duration-150 outline-none hover:bg-foreground/[0.06] focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100 min-[1366px]:pr-4 min-[1366px]:pl-3.5"
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
