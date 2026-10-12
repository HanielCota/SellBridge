import type { AdminEvent } from "@sellbridge/database/repositories";
import { SmartDate } from "@/components/data/smart-date";
import { describeAdminEvent } from "@/features/admin/admin-actions";
import { cn } from "@/lib/utils";

interface TimelineItem {
  key: string;
  date: Date;
  label: string;
  by: string | null;
  tone: "admin" | "activity" | "origin";
}

const DOT_CLASSES: Record<TimelineItem["tone"], string> = {
  admin: "bg-sky-500",
  activity: "bg-emerald-500",
  origin: "bg-muted-foreground/50",
};

/** Items shown before the oldest ones are left to the full record. */
const VISIBLE_ITEMS = 6;

function timelineItems(
  customer: { createdAt: Date; lastSeenAt: Date | null },
  events: readonly AdminEvent[],
): TimelineItem[] {
  const items: TimelineItem[] = events.map((event) => ({
    key: event.id,
    date: event.createdAt,
    label: describeAdminEvent(event.action, event.details),
    by: event.adminName,
    tone: "admin",
  }));
  if (customer.lastSeenAt) {
    items.push({
      key: "last-seen",
      date: customer.lastSeenAt,
      label: "Último acesso do cliente",
      by: null,
      tone: "activity",
    });
  }
  items.push({
    key: "created",
    date: customer.createdAt,
    label: "Criou a conta",
    by: null,
    tone: "origin",
  });
  return items.toSorted((left, right) => right.date.getTime() - left.date.getTime());
}

/**
 * What happened to a customer's account, newest first: what each admin did to it, when the
 * customer last came in, and when it all started.
 */
export function CustomerTimeline({
  customer,
  events,
}: {
  customer: { createdAt: Date; lastSeenAt: Date | null };
  events: readonly AdminEvent[];
}) {
  const items = timelineItems(customer, events).slice(0, VISIBLE_ITEMS);
  return (
    <ol className="relative space-y-3 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-border">
      {items.map((item) => (
        <li key={item.key} className="relative grid grid-cols-[7px_minmax(0,1fr)_auto] gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 size-[7px] rounded-full ring-2 ring-card",
              DOT_CLASSES[item.tone],
            )}
          />
          <span className="min-w-0 text-footnote">
            <span className="block text-foreground">{item.label}</span>
            {item.by ? <span className="block text-muted-foreground">por {item.by}</span> : null}
          </span>
          <SmartDate date={item.date} className="text-footnote text-muted-foreground" />
        </li>
      ))}
    </ol>
  );
}
