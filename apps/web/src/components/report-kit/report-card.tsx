import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ReportCardProps {
  title: string;
  /** Small secondary line under the title (the base, the rule). */
  note?: string | null | undefined;
  /** Controls on the right of the title (the tabs of the cases, a switch). */
  actions?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}

/** The card every block of the report sits in: the app's surface, 15px semibold title. */
export function ReportCard({ title, note, actions, className, children }: ReportCardProps) {
  return (
    <section
      className={cn("surface-card min-w-0 rounded-3xl bg-card p-5 break-inside-avoid", className)}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-subhead font-semibold">{title}</h2>
          {note ? <p className="text-footnote text-muted-foreground">{note}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
