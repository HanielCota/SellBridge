import { PlusIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import type { TicketCategory } from "@sellbridge/shared/schemas";
import { RecentTickets } from "@/components/support/recent-tickets";
import { SupplierConversationsEntry } from "@/components/supplier-support/supplier-conversations-entry";
import { Button } from "@/components/ui/button";
import { outOfHoursNotice, shortSupportHoursText } from "@/features/support/response-time";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

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
function SupportActions({
  kind,
  topic,
  onNavigate,
}: {
  kind: ProfileKind;
  topic: TicketCategory | undefined;
  onNavigate: () => void;
}) {
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
          <Link
            to="/suporte/novo"
            search={topic === undefined ? {} : { categoria: topic }}
            onClick={onNavigate}
          >
            <PlusIcon aria-hidden="true" />
            Abrir chamado
          </Link>
        </Button>
        {kind === "seller" ? <SupplierConversationsEntry onNavigate={onNavigate} /> : null}
      </div>
    </div>
  );
}

/**
 * The help card: hours, a new ticket (on the page's topic when there is one), the supplier
 * conversations for a reseller, and the recent tickets with a link to all of them.
 */
export function SupportHelpPanel({
  kind,
  topic,
  onNavigate,
}: {
  kind: ProfileKind;
  topic: TicketCategory | undefined;
  onNavigate: () => void;
}) {
  return (
    <>
      <SupportActions kind={kind} topic={topic} onNavigate={onNavigate} />
      <RecentTickets onNavigate={onNavigate} />
    </>
  );
}
