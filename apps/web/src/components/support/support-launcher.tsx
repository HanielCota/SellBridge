import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { watchCoveredControls } from "@/features/support/launcher-clearance";
import { launcherTopic } from "@/features/support/launcher-topic";
import { cn } from "@/lib/utils";

/** The support pages already hold the form and the threads. */
// The new-listing page has a publish bar along the bottom; the bubble covered its button there.
const HIDDEN_ON = ["/suporte", "/publicacoes/nova"];

/**
 * How long the bubble spells out "Falar com o suporte" before folding into its icon: long
 * enough to be read on arrival, short enough not to sit over the page (it covered "Operar
 * pedido" on phones).
 */
const LAUNCHER_LABEL_MILLISECONDS = 10_000;

const LauncherIcon = ACTION_ICONS.supportChat.icon;

/** Folds the label once it sits over a control of the page; nothing to watch once folded. */
function watchWhileLabelled(
  bubble: HTMLAnchorElement | null,
  showsLabel: boolean,
  fold: () => void,
): () => void {
  const page = document.getElementById("main-content");
  if (!showsLabel || bubble === null || page === null) {
    return () => {};
  }
  return watchCoveredControls(bubble, page, fold);
}

/**
 * The label folds after a while, or at once when it would sit over a control of the page. The
 * bubble comes as an element, not a ref, so the watch starts whenever it is rendered (it is not
 * on the support pages).
 */
function useLabelOnArrival(bubble: HTMLAnchorElement | null): boolean {
  const [showsLabel, setShowsLabel] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowsLabel(false), LAUNCHER_LABEL_MILLISECONDS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(
    () => watchWhileLabelled(bubble, showsLabel, () => setShowsLabel(false)),
    [bubble, showsLabel],
  );
  return showsLabel;
}

/**
 * The bubble in the corner of every page: it opens the guided new-ticket form, on the money
 * topic from the money pages. It used to hold a free-text chat that skipped the topic and
 * situation, so those tickets reached the team as "Outro tema" with no priority worked out.
 */
export function SupportLauncher() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [bubble, setBubble] = useState<HTMLAnchorElement | null>(null);
  const showsLabel = useLabelOnArrival(bubble);
  const hidden = HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (hidden) {
    return null;
  }
  const topic = launcherTopic(pathname);
  // Outside <main>, so it needs a landmark of its own: content outside every landmark is lost
  // to screen-reader users skipping between regions (axe "region").
  return (
    <aside aria-label="Suporte">
      <Link
        ref={setBubble}
        to="/suporte/novo"
        search={topic === undefined ? {} : { categoria: topic }}
        aria-label="Falar com o suporte"
        className="group fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex h-14 min-w-14 items-center justify-center rounded-full bg-brand px-3.5 text-primary-foreground shadow-lg shadow-black/25 transition-[scale] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-[0.94] active:duration-100 motion-reduce:active:scale-100 md:right-8 md:bottom-8"
      >
        <LauncherIcon className="size-7 shrink-0" weight="fill" aria-hidden="true" />
        <span
          aria-hidden="true"
          className={cn(
            "overflow-hidden text-[0.95rem] font-semibold whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none",
            showsLabel
              ? "ml-2 max-w-48 pr-1 opacity-100"
              : "max-w-0 opacity-0 [@media(hover:hover)]:group-hover:ml-2 [@media(hover:hover)]:group-hover:max-w-48 [@media(hover:hover)]:group-hover:pr-1 [@media(hover:hover)]:group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-48 group-focus-visible:pr-1 group-focus-visible:opacity-100",
          )}
        >
          Falar com o suporte
        </span>
      </Link>
    </aside>
  );
}
