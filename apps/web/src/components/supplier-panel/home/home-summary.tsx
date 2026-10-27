import { cn } from "@/lib/utils";

export interface HomeSummaryItem {
  /** The group's anchor in the list; null when the group has nothing and is not shown. */
  anchor: string | null;
  count: number;
  label: string;
  note: string;
  /** Red note: something in the group is past its deadline. */
  pressing: boolean;
}

function SummaryCellBody({ item }: { item: HomeSummaryItem }) {
  return (
    <>
      <span className="block text-2xl font-semibold tabular-nums">{item.count}</span>
      <span className="block text-footnote text-muted-foreground">{item.label}</span>
      <span
        className={cn(
          "block text-footnote",
          item.pressing ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {item.note}
      </span>
    </>
  );
}

const CELL_CLASS_NAME =
  "block min-w-0 px-4 py-4 not-first:border-l not-first:border-border sm:px-5";

/**
 * The three counts on top of the list, each a jump to its group: the supplier sees how much
 * waits, and how much of it is late, before reading a single row.
 */
export function HomeSummary({ items }: { items: readonly HomeSummaryItem[] }) {
  return (
    <nav aria-label="Resumo da fila" className="grid grid-cols-3 border-b border-border">
      {items.map((item) =>
        item.anchor === null ? (
          <div key={item.label} className={CELL_CLASS_NAME}>
            <SummaryCellBody item={item} />
          </div>
        ) : (
          <a
            key={item.label}
            href={`#${item.anchor}`}
            className={cn(
              CELL_CLASS_NAME,
              "outline-none transition-colors duration-100 hover:bg-foreground/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
            )}
          >
            <SummaryCellBody item={item} />
          </a>
        ),
      )}
    </nav>
  );
}
