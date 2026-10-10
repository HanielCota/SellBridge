import { formatCents } from "@sellbridge/shared/money";
import { cn } from "@/lib/utils";

/**
 * Right-aligned amount for table cells with a real minus sign; `emphasize` bolds it and
 * reds out losses, `muted` greys out secondary amounts such as costs.
 */
export function Money({
  cents,
  emphasize = false,
  muted = false,
}: {
  cents: number;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "block text-right whitespace-nowrap tabular-nums",
        muted && "text-muted-foreground",
        emphasize && "font-semibold",
        emphasize && cents < 0 && "text-destructive",
      )}
    >
      {cents < 0 ? `−${formatCents(-cents)}` : formatCents(cents)}
    </span>
  );
}
