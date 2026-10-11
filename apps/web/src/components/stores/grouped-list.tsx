import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * An inset grouped list: one rounded surface, rows split by hairlines that start after the mark
 * column, so the marks read as a single column. Rows are expected to use `px-5` and `MarkSlot`.
 */
export function GroupedList({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-3xl bg-card ring-1 ring-border ring-inset",
        "[&>li]:relative [&>li:not(:first-child)]:before:absolute [&>li:not(:first-child)]:before:top-0 [&>li:not(:first-child)]:before:right-0 [&>li:not(:first-child)]:before:left-25 [&>li:not(:first-child)]:before:h-px [&>li:not(:first-child)]:before:bg-border",
        className,
      )}
      {...props}
    />
  );
}

/** Fixed-width column for a marketplace mark, so names line up with the hairlines. */
export function MarkSlot({ children }: { children: ReactNode }) {
  return <span className="relative flex w-16 shrink-0 justify-center">{children}</span>;
}
