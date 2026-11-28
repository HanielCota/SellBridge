import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { useRouterState } from "@tanstack/react-router";
import { Popover } from "radix-ui";
import { useState } from "react";
import { SolarIcon } from "@/components/layout/solar-icon";
import { SupportHelpPanel } from "@/components/layout/support-button";
import { launcherTopic } from "@/features/support/launcher-topic";
import { supportButtonLabel } from "@/features/support/response-time";
import { badgeCount } from "@/lib/badge-count";
import { useSupportPosition } from "./use-support-position";

/** The support pages already hold the form and the threads. */
// The new-listing page has a publish bar along the bottom; the bubble covered its button there.
const HIDDEN_ON = ["/suporte", "/publicacoes/nova"];

/**
 * The one way to support, on every page: a round button in the corner that anyone can drag
 * anywhere beside the sidebar. It opens the help card (new ticket, supplier conversations,
 * recent tickets) and counts the support replies not read yet.
 */
export function SupportLauncher({ unread, kind }: { unread: number; kind: ProfileKind }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hidden = HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (hidden) {
    return null;
  }
  return <MovableSupportLauncher unread={unread} kind={kind} pathname={pathname} />;
}

function MovableSupportLauncher({
  unread,
  kind,
  pathname,
}: {
  unread: number;
  kind: ProfileKind;
  pathname: string;
}) {
  const { instructions, buttonProps } = useSupportPosition();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // Outside <main>, so it needs a landmark of its own (axe "region").
  return (
    <aside aria-label="Suporte" data-print-hidden>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={supportButtonLabel(unread)}
          aria-describedby={instructions}
          title="Falar com o suporte"
          className="staff-support-link"
          {...buttonProps}
        >
          <SolarIcon name="support" className="size-6" />
          {unread > 0 ? (
            <span aria-hidden="true" className="staff-support-count">
              {badgeCount(unread)}
            </span>
          ) : null}
          <span id={instructions} className="sr-only">
            Arraste para mover o botão ou use as setas do teclado. Use Home para voltar ao canto
            inicial.
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="end"
            sideOffset={12}
            collisionPadding={16}
            aria-labelledby="support-panel-title"
            className="z-50 w-[min(22rem,calc(100vw-2rem))] origin-(--radix-popover-content-transform-origin) space-y-2 rounded-2xl bg-popover p-2 text-popover-foreground shadow-xl shadow-black/15 ring-1 ring-border outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-[230ms] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-[160ms]"
          >
            <SupportHelpPanel kind={kind} topic={launcherTopic(pathname)} onNavigate={close} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </aside>
  );
}
