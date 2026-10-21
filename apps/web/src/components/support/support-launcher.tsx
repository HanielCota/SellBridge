import { Link, useRouterState } from "@tanstack/react-router";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";

/** The support pages already hold the form and the threads. */
// The new-listing page has a publish bar along the bottom; the bubble covered its button there.
const HIDDEN_ON = ["/suporte", "/publicacoes/nova"];

const LauncherIcon = ACTION_ICONS.supportChat.icon;

/**
 * The bubble in the corner of every page opens the guided new-ticket form, like the Suporte
 * button. It used to hold a free-text chat that skipped the topic and situation, so those
 * tickets reached the team as "Outro tema" with no priority worked out.
 */
export function SupportLauncher() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hidden = HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (hidden) {
    return null;
  }
  // Outside <main>, so it needs a landmark of its own: content outside every landmark is lost
  // to screen-reader users skipping between regions (axe "region").
  return (
    <aside aria-label="Suporte">
      <Hint label={ACTION_ICONS.supportChat.hint} openOnTap={false}>
        <Link
          to="/suporte/novo"
          aria-label="Abrir chamado"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-brand text-primary-foreground shadow-lg shadow-black/25 transition-[scale] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-[0.94] active:duration-100 motion-reduce:active:scale-100 md:right-8 md:bottom-8"
        >
          <LauncherIcon className="size-7" weight="fill" aria-hidden="true" />
        </Link>
      </Hint>
    </aside>
  );
}
