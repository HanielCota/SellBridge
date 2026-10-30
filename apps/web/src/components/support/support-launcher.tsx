import { Link, useRouterState } from "@tanstack/react-router";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { launcherTopic } from "@/features/support/launcher-topic";

/** The support pages already hold the form and the threads. */
// The new-listing page has a publish bar along the bottom; the bubble covered its button there.
const HIDDEN_ON = ["/suporte", "/publicacoes/nova"];

const LauncherIcon = ACTION_ICONS.supportChat.icon;

/**
 * The bubble in the corner of every page: it opens the guided new-ticket form, on the money
 * topic from the money pages. It used to hold a free-text chat that skipped the topic and
 * situation, so those tickets reached the team as "Outro tema" with no priority worked out. It
 * stays round (board 4, approved on 2026-10-25): its spelled-out label covered "Operar pedido"
 * and "Avaliar"; the name is in the hint and for screen readers, and every page ends with room
 * for it (the bottom padding of `main`).
 */
export function SupportLauncher() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hidden = HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (hidden) {
    return null;
  }
  const topic = launcherTopic(pathname);
  // Outside <main>, so it needs a landmark of its own: content outside every landmark is lost
  // to screen-reader users skipping between regions (axe "region").
  return (
    <aside aria-label="Suporte">
      <Hint label="Falar com o suporte" openOnTap={false}>
        <Link
          to="/suporte/novo"
          search={topic === undefined ? {} : { categoria: topic }}
          aria-label="Falar com o suporte"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-brand text-primary-foreground shadow-lg shadow-black/25 transition-[scale] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-[0.94] active:duration-100 motion-reduce:active:scale-100 md:right-8 md:bottom-8"
        >
          <LauncherIcon className="size-7 shrink-0" weight="fill" aria-hidden="true" />
        </Link>
      </Hint>
    </aside>
  );
}
