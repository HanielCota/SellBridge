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
import {
  outOfHoursNotice,
  shortSupportHoursText,
  supportButtonLabel,
} from "@/features/support/response-time";
import { useNow } from "@/hooks/use-now";
import { badgeCount } from "@/lib/badge-count";
import { cn } from "@/lib/utils";
import { navTabClassName } from "./nav-tab-parts";

const SupportIcon = ACTION_ICONS.support.icon;

/** Size, shape, focus ring and press feedback shared by the round buttons beside the bell. */
export const HEADER_ROUND_BUTTON_CLASSES =
  "relative flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-card duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100";

/** One short line: the hours, or, outside them, when answers start again, in the body colour. */
function SupportHoursLine() {
  const now = useNow();
  const isOutOfHours = outOfHoursNotice(now) !== null;
  return (
    <p
      className={cn(
        "text-xs",
        isOutOfHours ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      {shortSupportHoursText(now)}
    </p>
  );
}

/** The two ways out of the card, side by side in weight: the team's ticket and the supplier. */
function SupportActions({ kind, onNavigate }: { kind: ProfileKind; onNavigate: () => void }) {
  return (
    <div className="space-y-3 px-2.5 pt-2 pb-1">
      <div className="space-y-0.5">
        <h2 id="support-panel-title" className="text-sm font-semibold">
          Precisa de ajuda?
        </h2>
        <SupportHoursLine />
      </div>
      <div className="space-y-2">
        <Button asChild className="w-full">
          <Link to="/suporte/novo" onClick={onNavigate}>
            <PlusIcon aria-hidden="true" />
            Abrir chamado
          </Link>
        </Button>
        {kind === "seller" ? <SupplierConversationsEntry onNavigate={onNavigate} /> : null}
      </div>
    </div>
  );
}

/** The row's icon, word and unread count; shrunk, the count sits on the icon's corner. */
function SupportTriggerContent({ unread, collapsed }: { unread: number; collapsed: boolean }) {
  return (
    <>
      <SupportIcon className="size-5 shrink-0" aria-hidden="true" />
      <span
        className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate text-left"}
        aria-hidden="true"
      >
        Suporte
      </span>
      {/* Keeps "Suporte" and the badge apart as words, so the name check reads "Suporte 9+". */}{" "}
      {unread > 0 ? (
        <span
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-caption font-semibold text-primary-foreground tabular-nums",
            collapsed && "absolute -top-1 -right-1 scale-90",
          )}
        >
          {badgeCount(unread)}
        </span>
      ) : null}
    </>
  );
}

/**
 * Help one click away from every page, at the foot of the sidebar: open a ticket, or jump back
 * into one. The badge counts tickets with a support reply you have not read yet.
 */
export function SupportButton({
  unread,
  profileKind,
  collapsed,
}: {
  unread: number;
  profileKind: ProfileKind;
  /** The sidebar shrunk to its icons: the word stays for screen readers. */
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Hint label={collapsed ? "Suporte" : ACTION_ICONS.support.hint} openOnTap={false}>
        <Popover.Trigger
          aria-label={supportButtonLabel(unread)}
          className={cn(
            navTabClassName({
              isActive: false,
              paintsOwnPill: true,
              padding: collapsed ? "px-0" : "px-4",
            }),
            "w-full data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-foreground",
            collapsed && "justify-center",
          )}
        >
          <SupportTriggerContent unread={unread} collapsed={collapsed} />
        </Popover.Trigger>
      </Hint>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={12}
          aria-labelledby="support-panel-title"
          className="z-50 w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-2xl bg-popover p-2 text-popover-foreground shadow-xl shadow-black/15 ring-1 ring-border outline-none"
        >
          <SupportActions kind={profileKind} onNavigate={close} />
          <RecentTickets onNavigate={close} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
