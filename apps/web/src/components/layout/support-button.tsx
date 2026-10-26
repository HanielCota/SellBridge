import { PlusIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Popover } from "radix-ui";
import { useState } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { RecentTickets } from "@/components/support/recent-tickets";
import { SupplierConversationsEntry } from "@/components/supplier-support/supplier-conversations-entry";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { OutOfHoursNotice } from "@/components/support/out-of-hours-notice";
import { SUPPORT_HOURS_TEXT, unreadRepliesText } from "@/features/support/response-time";
import { cn } from "@/lib/utils";

const SupportIcon = ACTION_ICONS.support.icon;

/** Size, shape, focus ring and press feedback shared by the round buttons beside the bell. */
export const HEADER_ROUND_BUTTON_CLASSES =
  "relative flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-card duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100";

/**
 * Help one tap away from every page: open a ticket, or jump back into one. The badge counts
 * tickets with a support reply you have not read yet.
 */
/** The team's hours and the way into a new ticket: the first thing the card offers. */
function TeamSupportHeading({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="space-y-3 px-2.5 pt-2 pb-1">
      <div className="space-y-0.5">
        <h2 id="support-panel-title" className="text-sm font-semibold">
          Precisa de ajuda?
        </h2>
        <p className="text-xs text-muted-foreground">{SUPPORT_HOURS_TEXT}</p>
        <OutOfHoursNotice className="text-xs" />
      </div>
      <Button asChild size="sm" className="w-full">
        <Link to="/suporte/novo" onClick={onNavigate}>
          <PlusIcon aria-hidden="true" />
          Abrir chamado
        </Link>
      </Button>
    </div>
  );
}

export function SupportButton({
  unread,
  profileKind,
  className,
}: {
  unread: number;
  profileKind: ProfileKind;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Hint label={ACTION_ICONS.support.hint} openOnTap={false}>
        <Popover.Trigger
          aria-label={unread > 0 ? `Suporte: ${unreadRepliesText(unread)}` : "Suporte"}
          className={
            className ??
            cn(
              HEADER_ROUND_BUTTON_CLASSES,
              "text-muted-foreground transition-[color,scale] hover:text-foreground xl:pr-4 xl:pl-3.5",
            )
          }
        >
          <SupportIcon className="size-5" aria-hidden="true" />
          {/* The word only fits beside the centred tab capsule from xl up; below it the icon stands alone. */}
          <span className="hidden text-sm font-medium xl:inline" aria-hidden="true">
            Suporte
          </span>
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-caption font-semibold text-primary-foreground tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Popover.Trigger>
      </Hint>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          aria-labelledby="support-panel-title"
          className="z-50 w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-2xl bg-popover p-2 text-popover-foreground shadow-xl shadow-black/15 ring-1 ring-border outline-none"
        >
          <TeamSupportHeading onNavigate={close} />
          <SupplierConversationsEntry kind={profileKind} onNavigate={close} />
          <RecentTickets onNavigate={close} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
