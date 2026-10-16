import type { ReactNode } from "react";
import { SmartDate } from "@/components/data/smart-date";
import { cn } from "@/lib/utils";

/** A vertical rail of steps, as given (callers sort it): each with a colored dot and a date. */
export function DotTimeline({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ol
      aria-label={label}
      className="relative space-y-3 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-border"
    >
      {children}
    </ol>
  );
}

/** One step: its dot color class, what happened, and when. */
export function DotTimelineItem({
  dotClassName,
  date,
  children,
}: {
  dotClassName: string;
  date: Date;
  children: ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[7px_minmax(0,1fr)_auto] gap-3">
      <span
        aria-hidden="true"
        className={cn("mt-1.5 size-[7px] rounded-full ring-2 ring-card", dotClassName)}
      />
      <span className="min-w-0 text-footnote">{children}</span>
      <SmartDate date={date} className="text-footnote text-muted-foreground" />
    </li>
  );
}
